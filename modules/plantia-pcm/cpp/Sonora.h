#pragma once
#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <limits>
#include <memory>
#include <stdexcept>
#include <unordered_map>
#include <unordered_set>
#include <vector>

// Numerical counterpart of src/lib/sonora/dsp.ts. Buffers are float32, state
// and intermediate arithmetic are double, matching JS. No fast-math or FMA.
namespace sonora {
constexpr double TAU = 6.283185307179586476925286766559;
constexpr double INF = std::numeric_limits<double>::infinity();
inline double clamp(double x, double lo = 0, double hi = 1) { return std::max(lo, std::min(hi, x)); }
inline double smooth(double x) { double v = clamp(x); return v*v*(3-2*v); }
inline double sine(double phase) {
  static const auto table = [] {
    std::array<float, 2049> t{};
    for (int i=0;i<=2048;i++) t[i]=static_cast<float>(std::sin(i*TAU/2048));
    return t;
  }();
  double x=(phase-std::floor(phase))*2048; int i=static_cast<int>(x);
  return double(table[i])+(double(table[i+1])-table[i])*(x-i);
}
struct Patch { double delayOn=0, delayWet=0, delayRate=50, chorusOn=0, depth=0, chorusRate=0, reverbOn=0, reverbWet=0, amount=0; };
struct Effects {
  std::vector<float> dl, dr;
  std::array<std::vector<float>,4> lines;
  std::array<size_t,4> indices{};
  std::array<double,4> damp{};
  size_t at=0; double phase=0, rate;
  explicit Effects(double r):dl(std::ceil(r*1.3)),dr(dl.size()),rate(r) {
    double lengths[]={.097,.131,.173,.211};
    for(int j=0;j<4;j++) lines[j].resize(std::ceil(r*lengths[j]));
  }
  double tap(const std::vector<float>& b, double seconds) const {
    double x=std::fmod(double(at)-seconds*rate+b.size(),double(b.size()));
    size_t i=static_cast<size_t>(x);
    return double(b[i])+(double(b[(i+1)%b.size()])-b[i])*(x-i);
  }
  std::array<double,2> process(double l,double r,const Patch& p) {
    double dt=.07+1.1*(1-p.delayRate/100), echoL=tap(dr,dt), echoR=tap(dl,dt*1.017);
    dl[at]=l+(p.delayOn?echoL*.32:0); dr[at]=r+(p.delayOn?echoR*.32:0);
    if(p.chorusOn) {
      phase+=(.08+p.chorusRate/100*1.12)/rate; double depth=p.depth/100;
      double cl=tap(dl,.018+sine(phase)*.003*depth), cr=tap(dr,.021+sine(phase+.25)*.003*depth);
      l=l*(1-depth*.35)+cl*depth*.35; r=r*(1-depth*.35)+cr*depth*.35;
    }
    if(p.delayOn) {double wet=p.delayWet/100; l=l*(1-wet)+echoL*wet; r=r*(1-wet)+echoR*wet;}
    double sum=0;
    for(int j=0;j<4;j++){damp[j]+=(lines[j][indices[j]]-damp[j])*.3;sum+=damp[j];}
    double feedback=.48+p.amount/100*.4;
    for(int j=0;j<4;j++) {
      lines[j][indices[j]]=(j%2?r:l)*.3+(sum*.5-damp[j])*feedback;
      indices[j]=(indices[j]+1)%lines[j].size();
    }
    double earlyL=tap(dl,.023),earlyR=tap(dr,.031);
    double wetL=earlyL*.78+(damp[0]+damp[1]-damp[2]-damp[3])*.22;
    double wetR=earlyR*.78+(damp[0]-damp[1]+damp[2]-damp[3])*.22;
    at=(at+1)%dl.size();
    if(p.reverbOn){double wet=p.reverbWet/100;l=l*(1-wet)+wetL*wet;r=r*(1-wet)+wetR*wet;}
    return {l,r};
  }
};
struct Voice {
  double id=0, time=0, sourceTime=0, stop=0, forced=INF, attack=0, release=0;
  double position=0, position2=0, increment=0, increment2=0, phase=0, phase2=.07;
  double detuneRatio=1, frequency=0, attenuation=1, panL=0, panR=0, gain=0, color=0, pan=0;
  double evolution=0, decay=0, blend=0;
  int lane=0, model=0, family=0, trace=0;
  std::array<double,8> harmonics{}; std::array<double,4> ratios{};
  std::shared_ptr<std::vector<float>> sample, sample2;
};
struct Event {int type=0,lane=-1;double time=0; Voice voice; std::array<double,12> expression{};};
class Core {
  double rate,duck=1,greetingAt=-INF,dcL=0,dcR=0;
  uint64_t cursor=0;
  std::array<double,3> levels{1,1,1},meters{};
  std::array<Patch,3> patches;
  std::array<Effects,3> buses;
  std::array<double,12> expression{.35,.3,0,.33,.33,.33,.33,.33,.33,.33,.33,.33};
  std::array<double,12> target=expression;
  std::unordered_map<int,std::shared_ptr<std::vector<float>>> samples;
  std::vector<Voice> voices; std::vector<Event> pending;
  std::unordered_set<double> cancelled;
public:
  explicit Core(double r):rate(r),buses{Effects(r),Effects(r),Effects(r)} {
    if(!std::isfinite(r)||r<8000||r>96000)throw std::invalid_argument("Invalid sample rate");
  }
  double time() const {return double(cursor)/rate;}
  size_t voiceCount() const {return voices.size();}
  size_t pendingCount() const {return pending.size();}
  void sample(int id,const float* data,size_t count) {
    samples[id]=std::make_shared<std::vector<float>>(data,data+count);
  }
  void retainSamples(const double* ids,size_t count) {
    // Sounding and pending voices retain shared ownership of their old sample.
    for(auto it=samples.begin();it!=samples.end();) {
      if(std::find(ids,ids+count,it->first)==ids+count)it=samples.erase(it);else ++it;
    }
  }
  void configure(const double* p,size_t n) {
    if(n!=30)throw std::invalid_argument("Invalid configuration");
    for(int j=0;j<3;j++) {size_t o=j*10;levels[j]=p[o];patches[j]={p[o+1],p[o+2],p[o+3],p[o+4],p[o+5],p[o+6],p[o+7],p[o+8],p[o+9]};}
  }
  void schedule(const double* p,size_t n) {
    if(n<2)throw std::invalid_argument("Invalid event");
    Event e; e.type=int(p[0]);e.time=p[1];
    if(e.type==0) {
      if(n!=41)throw std::invalid_argument("Invalid note");
      auto& v=e.voice;
      v.id=p[2];v.time=p[3];v.sourceTime=p[4];v.lane=int(p[5]);v.stop=p[6];v.attack=p[7];v.release=p[8];
      auto get=[&](int id){auto it=samples.find(id);return it==samples.end()?std::shared_ptr<std::vector<float>>{}:it->second;};
      v.sample=get(int(p[9]));v.sample2=get(int(p[10]));v.increment=p[11];v.increment2=p[12];
      v.detuneRatio=p[13];v.frequency=p[14];v.attenuation=p[15];v.panL=p[16];v.panR=p[17];v.gain=p[18];
      v.color=p[19];v.pan=p[20];v.model=int(p[21]);v.family=int(p[22]);v.evolution=p[23];v.decay=p[24];v.blend=p[25];v.trace=int(p[26]);
      for(int j=0;j<8;j++)v.harmonics[j]=p[27+j];
      for(int j=0;j<4;j++)v.ratios[j]=p[35+j];
      v.phase=p[39];v.phase2=p[40];
      if(v.lane<0||v.lane>2)throw std::invalid_argument("Invalid lane");
    } else if(e.type==1) {
      if(n!=14)throw std::invalid_argument("Invalid expression");
      std::copy(p+2,p+14,e.expression.begin());
    } else if(e.type==2) {
      if(n!=3)throw std::invalid_argument("Invalid release");e.lane=int(p[2]);
    } else throw std::invalid_argument("Invalid event type");
    pending.push_back(std::move(e));
    std::stable_sort(pending.begin(),pending.end(),[](const Event&a,const Event&b){return a.time<b.time;});
  }
  void render(float* l,float* r,size_t frames) {
    size_t atEvent=0;std::array<double,3> maxima{};
    double dc=1-std::exp(-TAU*18/rate),slew=1-std::exp(-1/(.18*rate));
    double duckAttack=1-std::exp(-1/(.08*rate)),duckRelease=1-std::exp(-1/(.8*rate));
    for(size_t i=0;i<frames;i++,cursor++) {
      double t=time();
      while(atEvent<pending.size()&&pending[atEvent].time<=t) {
        const auto& e=pending[atEvent++];
        if(e.type==0) {
          if(cancelled.erase(e.voice.id)==0) {
            int count=0;Voice* first=nullptr;
            for(auto& v:voices)if(v.lane==e.voice.lane&&v.forced==INF){count++;if(!first)first=&v;}
            int limit=e.voice.lane==0?6:e.voice.lane==1?8:4;
            if(count>=limit&&first)first->forced=t+.025;
            voices.push_back(e.voice);
            if(e.voice.lane==2)greetingAt=t;
          }
        } else if(e.type==1)target=e.expression;
        else {
          for(auto& v:voices)if(e.lane<0||v.lane==e.lane)v.forced=std::min(v.forced,t+.15);
          for(size_t j=atEvent;j<pending.size();j++) {
            const auto& q=pending[j];
            if(q.type==0&&q.voice.sourceTime<=e.time&&(e.lane<0||q.voice.lane==e.lane))cancelled.insert(q.voice.id);
          }
        }
      }
      for(int j=0;j<12;j++)expression[j]+=(target[j]-expression[j])*slew;
      double brightness=clamp(expression[0]),energy=clamp(expression[1]);
      std::array<double,3> left{},right{};
      for(auto& v:voices) {
        double age=t-v.time;
        if(t>std::min(v.stop+v.release,v.forced))continue;
        double envelope=(age<v.attack?smooth(age/v.attack):1)*(t<v.stop?1:1-smooth((t-v.stop)/v.release))*(v.forced==INF?1:clamp((v.forced-t)/.025));
        double value=0;
        if(v.sample) {
          size_t p=size_t(std::floor(v.position));const auto&a=*v.sample;
          if(p+1<a.size())value=double(a[p])+(double(a[p+1])-a[p])*(v.position-p);
          v.position+=v.increment;
          if(v.sample2) {
            size_t q=size_t(std::floor(v.position2));const auto&b=*v.sample2;
            double other=q+1<b.size()?double(b[q])+(double(b[q+1])-b[q])*(v.position2-q):0;
            value=value*.6+other*.4;v.position2+=v.increment2;
          }
        } else if(v.model) {
          for(int j=0;j<4;j++)if(v.frequency*v.ratios[j]<rate*.43)
            value+=sine(age*v.frequency*v.ratios[j])*std::exp(-age*(1+j*.6)/(v.model==2?2.8:1.4))*(j?.3/(j+1):1);
        } else {
          v.phase+=v.frequency/rate;v.phase-=int(v.phase);
          v.phase2+=v.frequency*v.detuneRatio/rate;v.phase2-=int(v.phase2);
          double breathe=sine(age*v.evolution+v.color),decay=1/(1+age*v.decay);
          for(int j=0;j<8;j++) {
            double band=expression[3+(j+v.trace)%9],weight=j?.6+brightness*.4+band*.55:1;
            if(v.family==1)weight*=j?decay:.8;
            else if(v.family==2)weight*=j?decay*decay:.55+decay*.45;
            else if(v.family==3)weight*=.72+.28*sine(age*v.evolution+j*.22+expression[2]*.18);
            else if(v.family==4)weight*=.86+.14*sine(age*v.evolution+j*.31);
            else if(v.family==5)weight*=j%2?.7:1+band*.25;
            else weight*=j?.84+.16*breathe:1;
            double partial=sine(v.phase*(j+1))*(1-v.blend)+sine(v.phase2*(j+1))*v.blend;
            value+=partial*v.harmonics[j]*weight;
          }
          value*=(.9+energy*.14+breathe*.05)*v.attenuation;
        }
        if(v.lane==2) {
          double bloom=sine(age*v.frequency)*.58+sine(age*v.frequency*2)*.16,dust=0;
          for(int k=0;k<4;k++) {
            double elapsed=age-k*.19,harmonic=k+2;
            if(elapsed>0&&v.frequency*harmonic<rate*.43)
              dust+=sine(elapsed*v.frequency*harmonic)*smooth(elapsed/.2)*std::exp(-elapsed/(1.05+k*.16))*.12/(1+k*.5);
          }
          value=value*.3+bloom*std::exp(-age/2.1)+dust;
        }
        value*=envelope*v.gain;
        if(v.lane==0) {
          double drift=expression[2]*.13+sine(age*.08+v.pan)*.05;
          left[0]+=value*v.panL*(1-drift);right[0]+=value*v.panR*(1+drift);
        } else {left[v.lane]+=value*v.panL;right[v.lane]+=value*v.panR;}
      }
      double duckTarget=t-greetingAt<1.8?.48:1;
      duck+=(duckTarget-duck)*(duckTarget<duck?duckAttack:duckRelease);
      double outL=0,outR=0;
      for(int j=0;j<3;j++) {
        auto b=buses[j].process(left[j],right[j],patches[j]);double gain=levels[j]*(j<2?duck:1);
        outL+=b[0]*gain;outR+=b[1]*gain;
        maxima[j]=std::max(maxima[j],std::max(std::abs(b[0]*gain),std::abs(b[1]*gain)));
      }
      dcL+=(outL-dcL)*dc;dcR+=(outR-dcR)*dc;
      l[i]=std::tanh((outL-dcL)*1.65)*.9;r[i]=std::tanh((outR-dcR)*1.65)*.9;
      if(cursor%128==0)voices.erase(std::remove_if(voices.begin(),voices.end(),[t](const Voice&v){return !(t<std::min(v.stop+v.release,v.forced));}),voices.end());
    }
    pending.erase(pending.begin(),pending.begin()+atEvent);
    for(int j=0;j<3;j++)meters[j]=std::max(maxima[j],meters[j]*.92);
  }
};
} // namespace sonora
