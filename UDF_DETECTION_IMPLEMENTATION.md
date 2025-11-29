# Concrete Implementation: UDF Detection with Thread Pool Decision

## Files to Modify

1. `src/node_sqlite.h` - Add UDF tracking to Database class
2. `src/node_sqlite.cc` - Implement detection and conditional execution

## Step-by-Step Implementation

### Step 1: Modify Database Class Header

**File:** `src/node_sqlite.h`

Add these members to the Database class:

```cpp
class Database : public BaseObject {
  // ... existing code ...

 private:
  // Track registered user-defined functions
  std::unordered_set<std::string> registered_udfs_;
  std::unordered_set<std::string> registered_aggregate_udfs_;

  // Helper function for case-insensitive check
  bool HasUDFInSQL(const std::string& sql_text);

 public:
  // Called when a UDF is registered
  void AddRegisteredUDF(const std::string& name) {
    registered_udfs_.insert(name);
  }

  // Called when an aggregate UDF is registered
  void AddRegisteredAggregateUDF(const std::string& name) {
    registered_aggregate_udfs_.insert(name);
  }

  // Check if SQL likely uses any registered UDFs
  bool HasPotentialUDFUsage(const std::string& sql);
```

### Step 2: Update CustomFunction() Method

**File:** `src/node_sqlite.cc` - Around line 1296

In the `Database::CustomFunction()` method, add UDF tracking:

```cpp
void Database::CustomFunction(const FunctionCallbackInfo<Value>& args) {
  Database* db;
  ASSIGN_OR_RETURN_UNWRAP(&db, args.This());
  Environment* env = Environment::GetCurrent(args);
  THROW_AND_RETURN_ON_BAD_STATE(env, !db->IsOpen(), "database is not open");

  if (!args[0]->IsString()) {
    THROW_ERR_INVALID_ARG_TYPE(env->isolate(),
                               "The \"name\" argument must be a string.");
    return;
  }

  Utf8Value name(env->isolate(), args[0].As<String>());
  std::string func_name(*name, name.length());

  // ✅ ADD THIS: Track the registered UDF
  db->AddRegisteredUDF(func_name);

  // ... rest of existing implementation ...
}
```

### Step 3: Update AggregateFunction() Method

**File:** `src/node_sqlite.cc` - Around line 1469

In the `Database::AggregateFunction()` method, add tracking:

```cpp
void Database::AggregateFunction(const FunctionCallbackInfo<Value>& args) {
  Database* db;
  ASSIGN_OR_RETURN_UNWRAP(&db, args.This());
  Environment* env = Environment::GetCurrent(args);
  THROW_AND_RETURN_ON_BAD_STATE(env, !db->IsOpen(), "database is not open");

  Utf8Value name(env->isolate(), args[0].As<String>());
  std::string func_name(*name, name.length());

  // ✅ ADD THIS: Track the registered aggregate UDF
  db->AddRegisteredAggregateUDF(func_name);

  // ... rest of existing implementation ...
}
```

### Step 4: Implement HasPotentialUDFUsage()

**File:** `src/node_sqlite.cc` - Add this new method

Add this implementation somewhere in the Database methods section:

```cpp
bool Database::HasPotentialUDFUsage(const std::string& sql) {
  if (registered_udfs_.empty() && registered_aggregate_udfs_.empty()) {
    return false;
  }

  // Create uppercase version of SQL for case-insensitive comparison
  std::string sql_upper = sql;
  std::transform(sql_upper.begin(), sql_upper.end(),
                 sql_upper.begin(), ::toupper);

  // Check scalar functions
  for (const auto& udf : registered_udfs_) {
    std::string udf_upper = udf;
    std::transform(udf_upper.begin(), udf_upper.end(),
                   udf_upper.begin(), ::toupper);

    if (sql_upper.find(udf_upper) != std::string::npos) {
      return true;
    }
  }

  // Check aggregate functions
  for (const auto& agg : registered_aggregate_udfs_) {
    std::string agg_upper = agg;
    std::transform(agg_upper.begin(), agg_upper.end(),
                   agg_upper.begin(), ::toupper);

    if (sql_upper.find(agg_upper) != std::string::npos) {
      return true;
    }
  }

  return false;
}
```

### Step 5: Add Synchronous Run Method

**File:** `src/node_sqlite.cc`

Add a new synchronous version of the Get() method. First add to the helper class:

```cpp
class StatementAsyncExecutionHelper {
 public:
  // ... existing methods ...

  // New synchronous method for queries with UDFs
  static v8::MaybeLocal<v8::Value> GetSync(Environment* env,
                                            Statement* stmt);
};
```

Then implement it:

```cpp
MaybeLocal<Value> StatementAsyncExecutionHelper::GetSync(
    Environment* env, Statement* stmt) {
  Database* db = stmt->db_.get();
  Isolate* isolate = env->isolate();

  int r = sqlite3_step(stmt->statement_);

  if (r == SQLITE_DONE) {
    return Undefined(isolate);
  }

  if (r != SQLITE_ROW) {
    Local<Object> e;
    if (!CreateSQLiteError(isolate, db->Connection()).ToLocal(&e)) {
      return MaybeLocal<Value>();
    }
    isolate->ThrowException(e);
    return MaybeLocal<Value>();
  }

  int num_cols = sqlite3_column_count(stmt->statement_);

  if (num_cols == 0) {
    return Undefined(isolate);
  }

  TryCatch try_catch(isolate);
  Local<Value> result;
  if (StatementSQLiteToJSConverter::ConvertStatementGet(env,
                                                        stmt->statement_,
                                                        num_cols,
                                                        stmt->use_big_ints_,
                                                        stmt->return_arrays_)
          .ToLocal(&result)) {
    return result;
  }

  if (try_catch.HasCaught()) {
    try_catch.ReThrow();
  }

  return MaybeLocal<Value>();
}
```

### Step 6: Modify StatementAsyncExecutionHelper::Get()

**File:** `src/node_sqlite.cc` - Lines 2607-2665

Replace the `Get()` method with conditional logic:

```cpp
MaybeLocal<Promise::Resolver> StatementAsyncExecutionHelper::Get(
    Environment* env, Statement* stmt) {
  Database* db = stmt->db_.get();
  const char* sql_text = sqlite3_sql(stmt->statement_);

  // ✅ NEW: Check if this query uses user-defined functions
  if (sql_text != nullptr) {
    if (db->HasPotentialUDFUsage(sql_text)) {
      // UDF detected - run synchronously on main thread
      // Create a promise that resolves immediately with the result

      Local<Promise::Resolver> resolver;
      if (!Promise::Resolver::New(env->context()).ToLocal(&resolver)) {
        return MaybeLocal<Promise::Resolver>();
      }

      TryCatch try_catch(env->isolate());
      Local<Value> result;

      if (GetSync(env, stmt).ToLocal(&result)) {
        resolver->Resolve(env->context(), result).FromJust();
      } else if (try_catch.HasCaught()) {
        resolver->Reject(env->context(), try_catch.Exception()).FromJust();
      }

      return resolver;
    }
  }

  // Original async implementation for queries without UDFs
  auto task = [stmt]() -> std::tuple<int, int> {
    int r = sqlite3_step(stmt->statement_);
    if (r != SQLITE_ROW && r != SQLITE_DONE) {
      return std::make_tuple(r, 0);
    }
    return std::make_tuple(r, sqlite3_column_count(stmt->statement_));
  };

  auto after = [db, env, stmt](std::tuple<int, int> task_result,
                               Local<Promise::Resolver> resolver) {
    Isolate* isolate = env->isolate();
    auto [r, num_cols] = task_result;
    if (r == SQLITE_DONE) {
      resolver->Resolve(env->context(), Undefined(isolate)).FromJust();
      return;
    }

    if (r != SQLITE_ROW) {
      Local<Object> e;
      if (!CreateSQLiteError(isolate, db->Connection()).ToLocal(&e)) {
        return;
      }
      resolver->Reject(env->context(), e).FromJust();
      return;
    }

    if (num_cols == 0) {
      resolver->Resolve(env->context(), Undefined(isolate)).FromJust();
      return;
    }

    TryCatch try_catch(isolate);
    Local<Value> result;
    if (StatementSQLiteToJSConverter::ConvertStatementGet(env,
                                                          stmt->statement_,
                                                          num_cols,
                                                          stmt->use_big_ints_,
                                                          stmt->return_arrays_)
            .ToLocal(&result)) {
      resolver->Resolve(env->context(), result).FromJust();
      return;
    }

    if (try_catch.HasCaught()) {
      resolver->Reject(env->context(), try_catch.Exception()).FromJust();
    }
  };

  Local<Promise::Resolver> resolver =
      MakeSQLiteAsyncWork<std::tuple<int, int>>(env, db, task, after);
  if (resolver.IsEmpty()) {
    return MaybeLocal<Promise::Resolver>();
  }

  return resolver;
}
```

### Step 7: Apply Same Logic to Run() and All()

Apply the same conditional logic to `StatementAsyncExecutionHelper::Run()` and `StatementAsyncExecutionHelper::All()` methods.

## Testing

Create a test file to verify the fix:

```javascript
// test/parallel/test-sqlite-udf-async.js
'use strict';
const { skipIfSQLiteMissing } = require('../common');
skipIfSQLiteMissing();
const { Database } = require('node:sqlite');
const { suite, test } = require('node:test');
const assert = require('assert');

suite('SQLite UDF Async Safety', () => {
  test('UDF with async stmt.get() should work', async (t) => {
    const db = new Database(':memory:');

    function sleep(ms) {
      const start = Date.now();
      while (Date.now() - start < ms) {}
      return ms;
    }

    db.function('sleep', { deterministic: true }, sleep);

    const stmt = db.prepare('SELECT sleep(100) as val');
    const result = await stmt.get();

    assert.strictEqual(result.val, 100);
    db.close();
  });

  test('Built-in functions should use thread pool', async (t) => {
    const db = new Database(':memory:');

    db.exec('CREATE TABLE test (col1 TEXT)');
    db.exec("INSERT INTO test VALUES ('hello')");

    const stmt = db.prepare('SELECT UPPER(col1) as val FROM test');
    const result = await stmt.get();

    assert.strictEqual(result.val, 'HELLO');
    db.close();
  });

  test('Multiple UDFs should work', async (t) => {
    const db = new Database(':memory:');

    db.function('add', (a, b) => a + b);
    db.function('mul', (a, b) => a * b);

    const stmt = db.prepare('SELECT add(2, mul(3, 4)) as val');
    const result = await stmt.get();

    assert.strictEqual(result.val, 14);
    db.close();
  });
});
```

## Performance Impact

- **No async queries without UDFs**: No change
- **Async queries with UDFs**: Will run synchronously (safe, but won't be concurrent)
- **Sync queries**: No change
- **UDF detection overhead**: Minimal (hash set lookup + string search)

## Trade-offs

| Aspect | Impact |
|--------|--------|
| **Safety** | ✅ Completely eliminates crash |
| **Performance** | ⚠️ Queries with UDFs won't use thread pool |
| **Compatibility** | ✅ No API changes |
| **Complexity** | ✅ Simple implementation |
| **False Positives** | ⚠️ UDF name in string will cause sync execution |

## Future Improvements

1. More sophisticated SQL parsing to avoid false positives
2. Option to disable thread pool for specific UDFs
3. Option to enable thread pool explicitly despite UDFs
4. Performance monitoring to track how many queries use UDFs

## Rollout Plan

1. Implement all changes
2. Run existing tests to ensure no breakage
3. Add new test cases
4. Benchmark performance impact
5. Document in CHANGELOG.md
6. Consider for next Node.js release
