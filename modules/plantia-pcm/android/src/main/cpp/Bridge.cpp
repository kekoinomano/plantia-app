#include <jni.h>
#include "Store.h"
#define JNI_METHOD(name) Java_expo_modules_plantiapcm_PlantiaPcmModule_##name
#define GUARD std::lock_guard<std::mutex> lock(sonora::storeMutex); try
#define FAIL(ret) catch(const std::exception& e){env->ThrowNew(env->FindClass("java/lang/IllegalStateException"),e.what());return ret;}
static std::vector<double> doubles(JNIEnv* env,jdoubleArray a) {
  std::vector<double> v(env->GetArrayLength(a));env->GetDoubleArrayRegion(a,0,v.size(),v.data());return v;
}
extern "C" {
JNIEXPORT jint JNICALL JNI_METHOD(createNative)(JNIEnv*env,jobject,jdouble r){GUARD{return sonora::create(r);}FAIL(0)}
JNIEXPORT void JNICALL JNI_METHOD(destroyNative)(JNIEnv*env,jobject,jint id){GUARD{sonora::engines.erase(id);}FAIL()}
JNIEXPORT void JNICALL JNI_METHOD(configureNative)(JNIEnv*env,jobject,jint id,jdoubleArray a){GUARD{auto v=doubles(env,a);sonora::get(id).configure(v.data(),v.size());}FAIL()}
JNIEXPORT void JNICALL JNI_METHOD(scheduleNative)(JNIEnv*env,jobject,jint id,jdoubleArray a){GUARD{auto v=doubles(env,a);sonora::get(id).schedule(v.data(),v.size());}FAIL()}
JNIEXPORT void JNICALL JNI_METHOD(retainNative)(JNIEnv*env,jobject,jint id,jdoubleArray a){GUARD{auto v=doubles(env,a);sonora::get(id).retainSamples(v.data(),v.size());}FAIL()}
JNIEXPORT void JNICALL JNI_METHOD(sampleNative)(JNIEnv*env,jobject,jint id,jint key,jbyteArray a){GUARD{
  auto bytes=env->GetArrayLength(a);if(bytes%4)throw std::invalid_argument("Invalid PCM sample");
  std::vector<float> v(bytes/4);env->GetByteArrayRegion(a,0,bytes,reinterpret_cast<jbyte*>(v.data()));
  sonora::get(id).sample(key,v.data(),v.size());
}FAIL()}
JNIEXPORT jbyteArray JNICALL JNI_METHOD(renderNative)(JNIEnv*env,jobject,jint id,jint frames){GUARD{
  if(frames<1||frames>96000)throw std::invalid_argument("Invalid block size");
  std::vector<float> pcm(frames*2);sonora::get(id).render(pcm.data(),pcm.data()+frames,frames);
  auto out=env->NewByteArray(pcm.size()*sizeof(float));if(out)env->SetByteArrayRegion(out,0,pcm.size()*sizeof(float),reinterpret_cast<const jbyte*>(pcm.data()));return out;
}FAIL(nullptr)}
JNIEXPORT jdoubleArray JNICALL JNI_METHOD(statusNative)(JNIEnv*env,jobject,jint id){GUARD{
  auto& c=sonora::get(id);double status[]={c.time(),double(c.voiceCount()),double(c.pendingCount())};
  auto out=env->NewDoubleArray(3);if(out)env->SetDoubleArrayRegion(out,0,3,status);return out;
}FAIL(nullptr)}
}
