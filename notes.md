what the heck is `NewFunctionTemplate`? This is somehow used to define a constructor

  https://v8docs.nodesource.com/node-4.8/d8/d83/classv8_1_1_function_template.html
  it is an util --> https://github.com/nodejs/node/blob/7302b6fa3d0293405bd8ee864871a50ed6fea18b/src/util.cc#L397

where does `kInternalFieldCount` come from?

what does this line

```cpp
t->Inherit(HandleWrap::GetConstructorTemplate(env));
```

mean?

    it makes the template "t" to inherit from the template returned by `HandleWrap::GetConstructorTemplate(env)`

    FunctionTemplate Parent  -> Parent() . prototype -> { }
      ^                                                  ^
      | Inherit(Parent)                                  | .__proto__
      |                                                  |
    FunctionTemplate Child   -> Child()  . prototype -> { }

GetConstructorTemplate implementation

```cpp
Local<FunctionTemplate> HandleWrap::GetConstructorTemplate(
    IsolateData* isolate_data) {
  Local<FunctionTemplate> tmpl = isolate_data->handle_wrap_ctor_template();
  if (tmpl.IsEmpty()) {
    Isolate* isolate = isolate_data->isolate();
    tmpl = NewFunctionTemplate(isolate, nullptr);
    tmpl->SetClassName(
        FIXED_ONE_BYTE_STRING(isolate_data->isolate(), "HandleWrap"));
    tmpl->Inherit(AsyncWrap::GetConstructorTemplate(isolate_data));
    SetProtoMethod(isolate, tmpl, "close", HandleWrap::Close);
    SetProtoMethodNoSideEffect(isolate, tmpl, "hasRef", HandleWrap::HasRef);
    SetProtoMethod(isolate, tmpl, "ref", HandleWrap::Ref);
    SetProtoMethod(isolate, tmpl, "unref", HandleWrap::Unref);
    isolate_data->set_handle_wrap_ctor_template(tmpl);
  }
  return tmpl;
}
```
