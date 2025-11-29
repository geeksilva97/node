# SQLite Async User-Defined Function Segmentation Fault Report

## Executive Summary

The segmentation fault occurs when a **user-defined SQL function is invoked during an async `sqlite3_step()` call**. The issue stems from attempting to call V8 JavaScript code from a thread pool worker thread without proper isolate context and without being in a safe V8 scope.

## Crash Analysis

### Call Stack (Thread #8)
```
frame #15: node::sqlite::StatementAsyncExecutionHelper::Get()::operator()
           at node_sqlite.cc:2616:13
           └─> calls sqlite3_step(stmt->statement_)

frame #14: sqlite3_step(pStmt=0x0000000148093b80)
           at sqlite3.c:93304:16
           └─> invokes user-defined SQL function during query execution

frame #11: node::sqlite::UserDefinedFunction::xFunc
           at node_sqlite.cc:699:11
           └─> attempts to call JavaScript function

frame #10: v8::Function::Call(isolate=0x0000000000000000)
           ⚠️  ISOLATE IS NULL!
           └─> creates EscapableHandleScope with null isolate
           └─> accesses v8::internal::ReadOnlyRoots with null pointer
           └─> SEGMENTATION FAULT at roots-inl.h:158
```

### Root Cause

**The isolate pointer is NULL (0x0000000000000000) when xFunc is called from the thread pool worker thread.**

This happens because:

1. **Thread Mismatch**: `StatementAsyncExecutionHelper::Get()` runs `sqlite3_step()` on a thread pool worker thread
2. **User Function Invocation**: During `sqlite3_step()`, SQLite executes the custom SQL function defined via `db.function('sleep', ...)`
3. **No Isolate Context**: The worker thread has no access to the V8 isolate's thread-local data
4. **Null Isolate Dereference**: When `UserDefinedFunction::xFunc()` calls `env->isolate()` from the worker thread, it gets a null pointer
5. **V8 API Call Fails**: `fn->Call(env->context(), recv, argc, js_argv.data())` at line 699 tries to create an `EscapableHandleScope` with a null isolate, causing the crash

### Code Flow

```
Main Thread                        Worker Thread
─────────────────                  ─────────────
prepare('SELECT sleep(200)')
  ↓
get()
  ↓
StatementAsyncExecutionHelper::Get()
  └─> Creates Promise
  └─> Schedules work on thread pool
                                   DoThreadPoolWork() {
                                     ↓
                                     task()  // lambda in Get()
                                     ↓
                                     sqlite3_step(stmt)
                                     ↓
                                     SQLite evaluates: SELECT sleep(200)
                                     ↓
                                     Calls xFunc('sleep')
                                     ↓
                                     UserDefinedFunction::xFunc() {
                                       env = self->env_
                                       isolate = env->isolate()  // ⚠️ NULL!
                                       ↓
                                       fn->Call(env->context(), ...)
                                       ↓
                                       CRASH
                                     }
                                   }
```

## Specific Problem Location

**File**: `src/node_sqlite.cc`
**Function**: `StatementAsyncExecutionHelper::Get()`
**Lines**: 2607-2665

### The Lambda Capture Issue

```cpp
auto task = [stmt]() -> std::tuple<int, int> {
    // ⚠️ Only captures stmt
    // Does NOT capture env or isolate

    int r = sqlite3_step(stmt->statement_);
    // If user-defined function is called during step():
    //   - xFunc accesses self->env_
    //   - env is a raw pointer - could be invalid
    //   - env->isolate() is called from worker thread - returns NULL
    //   - V8 API call crashes

    if (r != SQLITE_ROW && r != SQLITE_DONE) {
      return std::make_tuple(r, 0);
    }
    return std::make_tuple(r, sqlite3_column_count(stmt->statement_));
};
```

## Why This Is a Critical Issue

1. **No Thread Safety**: User-defined functions are stored with a raw `Environment*` pointer that isn't guaranteed to be valid from other threads
2. **V8 Isolation Violation**: V8 is fundamentally single-threaded and doesn't support calls from worker threads without explicit context setup
3. **No Error Handling**: The code doesn't guard against accessing V8 APIs from non-isolate threads
4. **Appears Random**: The crash only happens when user-defined functions are actually invoked during async operations

## Solutions

### Option 1: Block UDFs in Async Statements (Safest)
Prevent user-defined functions from being called during async `sqlite3_step()`. This is the most conservative approach but may break use cases where users expect to call UDFs.

**Pros**:
- Completely safe - eliminates the issue
- Simple to implement
- Gives clear error messages

**Cons**:
- Reduces functionality
- May surprise users who expect UDFs to work

### Option 2: Queue UDF Calls Back to Main Isolate (Recommended)
When a UDF is called from a worker thread, queue the work back to the main V8 isolate thread using Node.js task queues or similar mechanism.

**Pros**:
- Maintains full functionality
- Thread-safe V8 access
- Proper async handling

**Cons**:
- More complex implementation
- Performance overhead
- Need to properly handle context switching

### Option 3: Use SQLite-Only User Functions
Restrict UDFs to simple SQLite scalar operations without V8 integration in async contexts.

**Pros**:
- Reasonable middle ground
- No crash
- Some UDFs still work

**Cons**:
- Complex to implement selectively
- Confusing API surface

## Recommended Fix

**Use Option 2**: Implement proper thread-safe UDF handling by:

1. Detecting when UDF is called from non-isolate thread
2. Using `uv_async_send()` or similar to queue work to the main thread
3. Properly synchronizing the response back to SQLite
4. Ensuring the UDF's JavaScript function is only called from the isolate thread

This maintains backward compatibility while fixing the crash.

## Test Case That Reproduces

```javascript
const { Database } = require('node:sqlite');
const db = new Database(':memory:');

// Register user-defined function
db.function('sleep', { deterministic: true }, (ms) => {
    const start = Date.now();
    while (Date.now() - start < ms) { }
    return ms;
});

// This crashes when run asynchronously
const stmt = db.prepare('SELECT sleep(200) as val');
const result = await stmt.get();  // ⚠️ CRASH
```

## Files Involved

- `src/node_sqlite.cc`: StatementAsyncExecutionHelper::Get (line 2607), UserDefinedFunction::xFunc (line 665)
- `src/node_sqlite.h`: Statement, Database, UserDefinedFunction class definitions
- `test/parallel/test-sqlite-multithreading.js`: Test that reproduces the crash

## Detection

The crash manifests as:
```
EXC_BAD_ACCESS (code=1, address=0x290)
Process stopped
* thread #8, name = 'libuv-worker', stop reason = EXC_BAD_ACCESS
```

With stack trace showing null isolate dereference in `v8::internal::ReadOnlyRoots::address_at()`.
