# Segmentation Fault Debug Summary

## Quick Reference

| Item | Value |
|------|-------|
| **Crash Location** | `v8::internal::ReadOnlyRoots::address_at()` at `roots-inl.h:158` |
| **Thread** | `thread #8, name = 'libuv-worker'` |
| **Signal** | `EXC_BAD_ACCESS (code=1, address=0x290)` |
| **Root Cause** | NULL isolate pointer dereference |
| **Trigger** | Async UDF call from thread pool worker |

## Crash Chain

```
1. User calls: await stmt.get()
2. Promise created, work scheduled on thread pool
3. Worker thread executes: sqlite3_step()
4. SQLite evaluates: SELECT sleep(200)
5. SQLite calls: xFunc('sleep')
6. xFunc retrieves: env->isolate() ← Returns NULL
7. xFunc calls: fn->Call(env->context(), ...)
8. V8 tries to create EscapableHandleScope with NULL isolate
9. Dereferences NULL pointer → CRASH
```

## Evidence from LLDB

### Frame #10 (Crash Point)
```
frame #10: v8::Function::Call(this=0x0000000144026670,
                              isolate=0x0000000000000000,  ← NULL!
                              context=Local<v8::Context> @ x2,
                              recv=Local<v8::Value> @ x20,
                              argc=1, argv=0x0000600003946a10)
```

### Frame #11 (UDF Callback)
```
frame #11: node::sqlite::UserDefinedFunction::xFunc
           (ctx=0x0000000148096d30, argc=1, argv=0x0000000148096d60)
           at node_sqlite.cc:699:11
```

### Frame #14-15 (SQLite Execution)
```
frame #14: sqlite3_step(pStmt=0x0000000148093b80)
frame #15: node::sqlite::StatementAsyncExecutionHelper::Get()::operator()
           at node_sqlite.cc:2616:13
```

## Key Code Locations

### Problem Code (node_sqlite.cc:2607-2665)
```cpp
MaybeLocal<Promise::Resolver> StatementAsyncExecutionHelper::Get(
    Environment* env, Statement* stmt) {
  Database* db = stmt->db_.get();

  auto task = [stmt]() -> std::tuple<int, int> {
    int r = sqlite3_step(stmt->statement_);  // LINE 2611 ← CRASH SOURCE
    // If UDF is called during step(), env->isolate() returns NULL
    // because worker thread has no isolate context

    if (r != SQLITE_ROW && r != SQLITE_DONE) {
      return std::make_tuple(r, 0);
    }
    return std::make_tuple(r, sqlite3_column_count(stmt->statement_));
  };
  // ... rest of implementation
}
```

### UDF Callback (node_sqlite.cc:665-709)
```cpp
void UserDefinedFunction::xFunc(sqlite3_context* ctx,
                                int argc,
                                sqlite3_value** argv) {
  UserDefinedFunction* self =
      static_cast<UserDefinedFunction*>(sqlite3_user_data(ctx));
  Environment* env = self->env_;
  Isolate* isolate = env->isolate();  // LINE 671 ← Returns NULL from worker!
  // ...
  MaybeLocal<Value> retval =
      fn->Call(env->context(), recv, argc, js_argv.data());  // LINE 699 ← CRASH HERE
}
```

## Why NULL Isolate From Worker Thread

In V8, `Isolate::GetCurrent()` uses thread-local storage to retrieve the current isolate:

```cpp
// Pseudo-code
static Isolate* GetCurrent() {
    return thread_local_current_isolate.Get();  // Empty for worker threads!
}
```

The thread-local storage is only populated for the main isolate thread. Worker threads have no context.

## Reproduction Test

```javascript
const { Database } = require('node:sqlite');
const db = new Database(':memory:');

// Define user function
db.function('sleep', { deterministic: true }, (ms) => {
    const start = Date.now();
    while (Date.now() - start < ms) {}
    return ms;
});

// This crashes
const stmt = db.prepare('SELECT sleep(200) as val');
await stmt.get();  // ❌ SEGFAULT

// This doesn't crash (sync doesn't use thread pool)
stmt.get();  // ✓ Works
```

## Why It's Hard to Spot

1. **Timing Dependent**: Only crashes if UDF is actually called during async step
2. **Thread-based**: Only manifests on worker threads
3. **No Guard Code**: No checks for thread context before calling V8 APIs
4. **Works Synchronously**: Same code works fine with sync operations (no thread pool)

## Fix Strategy

### Short Term (Workaround for Users)
- Don't use UDFs with async operations
- Use only sync operations (no `await`)

### Long Term (Proper Fix)
1. **Detect** when UDF is called from non-isolate thread
2. **Queue** the work back to main isolate thread via `uv_async_send()` or similar
3. **Synchronize** the response back to SQLite using condition variables
4. **Handle errors** gracefully if isolate becomes inaccessible

This requires significant refactoring of the UDF callback mechanism to be thread-safe.

## Files to Review for Fix

1. `src/node_sqlite.cc` - Main implementation
   - Line 2611: sqlite3_step() call in thread pool context
   - Line 699: UDF callback attempting V8 call

2. `src/node_sqlite.h` - Headers and class definitions
   - UserDefinedFunction class
   - StatementAsyncExecutionHelper class

3. Implementation pattern to follow: How Node.js handles async callbacks in other native modules

## Related SQLite Documentation

- SQLite callback model: Callbacks are synchronous and happen on the calling thread
- No mechanism in SQLite to defer callbacks to a specific thread
- This is a fundamental architectural mismatch with V8's threading model

## Related V8 Documentation

- Isolates are single-threaded by design
- All API calls must happen on the isolate's own thread
- Thread-local storage used for isolate context
- No way to call V8 APIs from other threads without explicit context setup (enter/exit)
