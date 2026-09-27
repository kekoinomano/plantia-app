#import <Foundation/Foundation.h>
NS_ASSUME_NONNULL_BEGIN
@interface PlantiaPcmBridge : NSObject
+ (NSNumber *)create:(double)rate;
+ (void)destroy:(NSNumber *)handle;
+ (void)configure:(NSNumber *)handle values:(NSArray<NSNumber *> *)values;
+ (void)schedule:(NSNumber *)handle values:(NSArray<NSNumber *> *)values;
+ (void)sample:(NSNumber *)handle key:(NSNumber *)key data:(NSData *)data;
+ (void)loadSfz:(NSNumber *)handle key:(NSNumber *)key lane:(NSNumber *)lane path:(NSString *)path gain:(NSNumber *)gain tuning:(NSNumber *)tuning;
+ (void)scheduleSfz:(NSNumber *)handle time:(NSNumber *)time key:(NSNumber *)key note:(NSNumber *)note velocity:(NSNumber *)velocity duration:(NSNumber *)duration;
+ (void)retainSamples:(NSNumber *)handle keys:(NSArray<NSNumber *> *)keys;
+ (NSData *)render:(NSNumber *)handle frames:(NSInteger)frames;
+ (NSArray<NSNumber *> *)status:(NSNumber *)handle;
@end
NS_ASSUME_NONNULL_END
