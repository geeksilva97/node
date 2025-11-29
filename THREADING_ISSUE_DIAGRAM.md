# Threading Architecture Issue: Async UDF Execution

## Problem Visualization

```
┌─────────────────────────────────────────────────────────────────┐
│                       V8 JavaScript Engine                      │
│                   (Single-Threaded Isolate)                     │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │           Main Thread (Isolate Context)                │   │
│  │                                                         │   │
│  │  - Valid isolate pointer                               │   │
│  │  - Can call V8 APIs                                    │   │
│  │  - Thread-local storage accessible                     │   │
│  │  - User-defined functions safe to call                 │   │
│  │                                                         │   │
│  │  1. user calls stmt.get() (async)                      │   │
│  │  2. Promise created, work scheduled                    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                           │                                     │
│                           │ (off-thread)                        │
│                           ▼                                     │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                   Thread Pool Worker Thread                     │
│                   (NO Isolate Context!)                         │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │           DoThreadPoolWork()                           │   │
│  │                                                         │   │
│  │  task = [stmt]() {                                      │   │
│  │    sqlite3_step(stmt->statement_)  // ⚠️ PROBLEM       │   │
│  │      │                                                  │   │
│  │      └─> SQLite evaluates: SELECT sleep(200)           │   │
│  │            │                                            │   │
│  │            └─> Calls xFunc('sleep')                    │   │
│  │                  │                                      │   │
│  │                  └─> UserDefinedFunction::xFunc()      │   │
│  │                       │                                 │   │
│  │                       └─> env->isolate()  ❌ NULL!      │   │
│  │                            │                            │   │
│  │                            └─> fn->Call(...)           │   │
│  │                                 │                       │   │
│  │                                 └─> EscapableHandleScope(NULL)
│  │                                      │                  │   │
│  │                                      └─> SEGFAULT       │   │
│  │  }                                                       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Problem:                                                       │
│  - No V8 isolate context                                       │
│  - Thread-local storage not initialized                        │
│  - env pointer might be invalid                                │
│  - V8 APIs crash when called from here                         │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow During Crash

```
JavaScript (Main Thread)
───────────────────────
    │
    ├─ db.prepare('SELECT sleep(200) as val')
    │    ├─ Creates Statement object
    │    └─ stmt captured by lambda: [stmt]
    │
    └─ await stmt.get()
         ├─ StatementAsyncExecutionHelper::Get()
         │   ├─ Creates Promise
         │   ├─ Schedules task on thread pool: task()
         │   └─ Returns Promise immediately
         │
         ▼ (continue on worker thread)
Worker Thread
─────────────
    │
    └─ task() lambda runs
        │
        ├─ sqlite3_step(stmt->statement_)  ◄─ KEY PROBLEM
        │   │
        │   ├─ SQLite executes: SELECT sleep(200)
        │   │
        │   ├─ Evaluates the sleep() function
        │   │
        │   └─ Calls xFunc('sleep')
        │       │
        │       ├─ UserDefinedFunction* self = sqlite3_user_data()
        │       ├─ Environment* env = self->env_  ◄─ Still valid pointer
        │       │
        │       ├─ Isolate* isolate = env->isolate()
        │       │   │
        │       │   ├─ Attempts to get thread-local isolate
        │       │   ├─ Worker thread has no isolate context
        │       │   └─ Returns NULL ❌
        │       │
        │       ├─ MaybeLocal<Value> retval = fn->Call(
        │       │       env->context(),  ❌ Invalid without isolate
        │       │       recv, argc, js_argv.data())
        │       │
        │       └─ V8 tries to create EscapableHandleScope(NULL)
        │           │
        │           └─ Accesses v8::internal::ReadOnlyRoots[NULL + offset]
        │               │
        │               └─ Dereference NULL pointer ❌ CRASH
```

## The Isolate Lifecycle

```
V8 Isolate Created (Main Thread)
│
├─ Thread-local storage configured
├─ ReadOnlyRoots initialized
├─ Heap allocated
└─ V8 APIs available
   │
   ├─ Main Thread: isolate->GetCurrent() ✓ Works
   │
   └─ Worker Thread: isolate->GetCurrent() ✗ Returns NULL
       (Thread-local storage not accessible)
```

## Why env->isolate() Returns NULL

```cpp
// In v8/src/api-inl.h (simplified)
class Isolate {
    static Isolate* GetCurrent() {
        return reinterpret_cast<Isolate*>(
            thread_local_isolate_storage.Get()  // ◄─ Empty in worker thread!
        );
    }
};

// In node_sqlite.cc:671
Isolate* isolate = env->isolate();  // ◄─ Calls GetCurrent()
                                    // ◄─ Returns NULL from worker thread
```

## Why The Crash Happens At That Address

```
v8::internal::ReadOnlyRoots::address_at() (at roots-inl.h:158)
│
├─ Input: index = 1 (from kTheHoleValue)
├─ this = NULL (from null isolate)
│
├─ Attempts: return read_only_roots_[1]
│  where read_only_roots_ is a member of `this` (which is NULL)
│
├─ Address calculation: NULL + offset
│   └─ Results in 0x290 (some small offset)
│
└─ Memory access violation: EXC_BAD_ACCESS (code=1, address=0x290)
```

## SQLite vs V8 Thread Model Conflict

```
SQLite Thread Model:
─────────────────
- Per-connection serialization (default)
- Callbacks can happen on any thread
- xFunc callbacks can execute synchronously during sqlite3_step()
- No thread-local context needed


V8 Thread Model:
───────────────
- Fundamentally single-threaded
- All API calls must happen on isolate's thread
- Thread-local storage for current isolate
- No context = No API calls possible


The Conflict:
─────────────
sqlite3_step() may invoke xFunc at any time
    │
    └─> User-defined xFunc calls V8 API
        │
        └─> Requires isolate thread context
            │
            └─> Thread pool worker has no context
                │
                └─> CRASH ❌
```

## Summary

The core issue is attempting to call V8 JavaScript from a SQLite callback that executes on a thread pool worker thread, where no V8 isolate context is available.

**SQLite provides no way to defer xFunc callbacks to a specific thread.**
**V8 provides no way to call APIs except from the isolate's own thread.**

**Result: Unavoidable crash when UDFs are used with async operations.**
