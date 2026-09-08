#import "PlantiaPcmBridge.h"
#include "../cpp/Store.h"
#define GUARD std::lock_guard<std::mutex> lock(sonora::storeMutex); try
#define FAIL catch(const std::exception& e){@throw [NSException exceptionWithName:@"PlantiaPcm" reason:@(e.what()) userInfo:nil];}
static std::vector<double> doubles(NSArray<NSNumber*>* a){std::vector<double> v;v.reserve(a.count);for(NSNumber*n in a)v.push_back(n.doubleValue);return v;}
@implementation PlantiaPcmBridge
+ (NSNumber*)create:(double)rate {GUARD{return @(sonora::create(rate));}FAIL}
+ (void)destroy:(NSNumber*)h {GUARD{sonora::engines.erase(h.intValue);}FAIL}
+ (void)configure:(NSNumber*)h values:(NSArray<NSNumber*>*)a {GUARD{auto v=doubles(a);sonora::get(h.intValue).configure(v.data(),v.size());}FAIL}
+ (void)schedule:(NSNumber*)h values:(NSArray<NSNumber*>*)a {GUARD{auto v=doubles(a);sonora::get(h.intValue).schedule(v.data(),v.size());}FAIL}
+ (void)retainSamples:(NSNumber*)h keys:(NSArray<NSNumber*>*)a {GUARD{auto v=doubles(a);sonora::get(h.intValue).retainSamples(v.data(),v.size());}FAIL}
+ (void)sample:(NSNumber*)h key:(NSNumber*)key data:(NSData*)data {GUARD{
  if(data.length%4)throw std::invalid_argument("Invalid PCM sample");
  std::vector<float> v(data.length/4);[data getBytes:v.data() length:data.length];sonora::get(h.intValue).sample(key.intValue,v.data(),v.size());
}FAIL}
+ (NSData*)render:(NSNumber*)h frames:(NSInteger)frames {GUARD{
  if(frames<1||frames>96000)throw std::invalid_argument("Invalid block size");
  NSMutableData* data=[NSMutableData dataWithLength:frames*2*sizeof(float)];float*p=static_cast<float*>(data.mutableBytes);
  sonora::get(h.intValue).render(p,p+frames,frames);return data;
}FAIL}
+ (NSArray<NSNumber*>*)status:(NSNumber*)h {GUARD{auto&c=sonora::get(h.intValue);return @[@(c.time()),@(c.voiceCount()),@(c.pendingCount())];}FAIL}
@end
