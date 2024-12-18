#include "async_wrap-inl.h"
#include "env-inl.h"
#include "handle_wrap.h"
#include "node.h"
#include "node_external_reference.h"
#include "permission/permission.h"
#include "string_bytes.h"
#include "sqlite3.h"

namespace node {

  using v8::Context;
  using v8::DontDelete;
  using v8::DontEnum;
  using v8::FunctionCallbackInfo;
  using v8::FunctionTemplate;
  using v8::HandleScope;
  using v8::Integer;
  using v8::Isolate;
  using v8::Local;
  using v8::MaybeLocal;
  using v8::Object;
  using v8::PropertyAttribute;
  using v8::ReadOnly;
  using v8::Signature;
  using v8::String;
  using v8::Symbol;
  using v8::Value;

  namespace sqlite_backup {
    class SQLiteBackup : public HandleWrap {
      public:
        static void Initialize(Local<Object> target,
            Local<Value> unused,
            Local<Context> context,
            void* priv);
        static void RegisterExternalReferences(ExternalReferenceRegistry* registry);
        static void New(const FunctionCallbackInfo<Value>& args);
        static void Step(const FunctionCallbackInfo<Value>& args);
        static void Finish(const FunctionCallbackInfo<Value>& args);

        SET_NO_MEMORY_INFO()
          SET_MEMORY_INFO_NAME(SQLiteBackup)
          SET_SELF_SIZE(SQLiteBackup)
      private:
          SQLiteBackup(Environment* env, Local<Object> object);
          ~SQLiteBackup() override = default;

          static void OnBackup(uv_work_t* req);
          static void AfterBackup(uv_work_t* req, int status);

          uv_handle_t handle_;
          sqlite3_backup* backup_;
          sqlite3* dest_db_;
          sqlite3* source_db_;
    };

    SQLiteBackup::SQLiteBackup(Environment* env, Local<Object> object)
      : HandleWrap(env,
          object,
          &handle_,
          AsyncWrap::PROVIDER_SQLITE_BACKUP) { }

    void SQLiteBackup::New(const FunctionCallbackInfo<Value>& args) {
      Environment* env = Environment::GetCurrent(args);

      new SQLiteBackup(env, args.This());
    }

    static void Initialize(Local<Object> target,
        Local<Value> unused,
        Local<Context> context,
        void* priv) {
      Environment* env = Environment::GetCurrent(context);
      Isolate* isolate = env->isolate();
      Local<FunctionTemplate> sqlite_backup_tmpl =
        NewFunctionTemplate(isolate, SQLiteBackup::New);
      sqlite_backup_tmpl->InstanceTemplate()->SetInternalFieldCount(
          SQLiteBackup::kInternalFieldCount);
      SetConstructorFunction(context, target, "SQLiteBackup", sqlite_backup_tmpl);
    }
  } // namespace sqlite_backup
}  // namespace node


// first argument is unique across all bindings
NODE_BINDING_CONTEXT_AWARE_INTERNAL(sqlite_backup, node::sqlite_backup::Initialize)
