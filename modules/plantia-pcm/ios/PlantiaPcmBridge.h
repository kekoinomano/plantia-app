#import <Foundation/Foundation.h>
NS_ASSUME_NONNULL_BEGIN
@interface PlantiaPcmBridge : NSObject
+ (NSNumber *)create:(double)rate;
+ (void)destroy:(NSNumber *)handle;
+ (void)configure:(NSNumber *)handle values:(NSArray<NSNumber *> *)values;
+ (void)schedule:(NSNumber *)handle values:(NSArray<NSNumber *> *)values;
+ (void)sample:(NSNumber *)handle key:(NSNumber *)key data:(NSData *)data;
+ (void)retainSamples:(NSNumber *)handle keys:(NSArray<NSNumber *> *)keys;
+ (NSData *)render:(NSNumber *)handle frames:(NSInteger)frames;
+ (NSArray<NSNumber *> *)status:(NSNumber *)handle;
@end
NS_ASSUME_NONNULL_END
