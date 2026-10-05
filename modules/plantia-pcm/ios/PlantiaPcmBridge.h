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
+ (void)beginMp3:(NSNumber *)handle path:(NSString *)path rate:(NSInteger)rate;
+ (void)renderMp3:(NSNumber *)handle frames:(NSInteger)frames;
+ (void)finishMp3:(NSNumber *)handle;
+ (void)cancelMp3:(NSNumber *)handle;
+ (NSArray<NSNumber *> *)status:(NSNumber *)handle;
@end
NS_ASSUME_NONNULL_END
