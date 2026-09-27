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
#include <string>
#include "../third_party/sfizz-1.2.3/src/sfizz.h"

// Numerical counterpart of src/lib/sonora/dsp.ts. Buffers are float32, state
// and intermediate arithmetic are double, matching JS. No fast-math or FMA.
namespace sonora {
constexpr double TAU = 6.283185307179586476925286766559;
constexpr double INF = std::numeric_limits<double>::infinity();
inline double clamp(double x, double lo = 0, double hi = 1) { return std::max(lo, std::min(hi, x)); }
inline double smooth(double x) { double v = clamp(x); return v*v*(3-2*v); }
inline double outputSample(double x) {
  double magnitude=std::abs(x);
  return std::copysign(magnitude<=.65?magnitude:.65+.22*std::tanh((magnitude-.65)/.22),x);
}
constexpr double MASTER_GAIN = 9;
inline double sine(double phase) {
  static const auto table = [] {
    std::array<float, 2049> t{};
    for (int i=0;i<=2048;i++) t[i]=static_cast<float>(std::sin(i*TAU/2048));
    return t;
  }();
  double x=(phase-std::floor(phase))*2048; int i=static_cast<int>(x);
  return double(table[i])+(double(table[i+1])-table[i])*(x-i);
}
inline double sampleAt(const std::vector<float>& data,double position) {
  size_t i=static_cast<size_t>(std::floor(position));double t=position-i;
  if(i+1>=data.size())return 0;
  if(i<1||i+2>=data.size())return double(data[i])+(double(data[i+1])-data[i])*t;
  double a=data[i-1],b=data[i],c=data[i+1],d=data[i+2];
  return b+.5*t*(c-a+t*(2*a-5*b+4*c-d+t*(3*(b-c)+d-a)));
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
  std::array<double,2> process(double l,double r,const Patch& p,double movement=0,double space=0) {
    double dt=.07+1.1*(1-p.delayRate/100), echoL=tap(dr,dt), echoR=tap(dl,dt*1.017);
    dl[at]=l+(p.delayOn?echoL*.32:0); dr[at]=r+(p.delayOn?echoR*.32:0);
    if(p.chorusOn) {
      phase+=(.08+p.chorusRate/100*1.12)/rate; double depth=clamp(p.depth/100*(.72+movement*.42));
      double cl=tap(dl,.018+sine(phase)*.003*depth), cr=tap(dr,.021+sine(phase+.25)*.003*depth);
      l=l*(1-depth*.35)+cl*depth*.35; r=r*(1-depth*.35)+cr*depth*.35;
    }
    if(p.delayOn) {double wet=clamp((p.delayWet+space*.5)/100); l=l*(1-wet)+echoL*wet; r=r*(1-wet)+echoR*wet;}
    double sum=0;
    for(int j=0;j<4;j++){damp[j]+=(lines[j][indices[j]]-damp[j])*.3;sum+=damp[j];}
    double feedback=.48+p.amount/100*.4;
    for(int j=0;j<4;j++) {
      lines[j][indices[j]]=(j%2?r:l)*.3+(sum*.5-damp[j])*feedback;
      indices[j]=(indices[j]+1)%lines[j].size();
    }
    double earlyL=tap(dl,.023),earlyR=tap(dr,.031);
    double wetL=earlyL*.16+(damp[0]+damp[1]-damp[2]-damp[3])*.65;
    double wetR=earlyR*.16+(damp[0]-damp[1]+damp[2]-damp[3])*.65;
    at=(at+1)%dl.size();
    if(p.reverbOn){double wet=clamp((p.reverbWet+space)/100);l=l*(1-wet)+wetL*wet;r=r*(1-wet)+wetR*wet;}
    return {l,r};
  }
};
struct Voice {
  uint32_t noise=1;
  double id=0, time=0, sourceTime=0, stop=0, forced=INF, attack=0, release=0;
  double position=0, position2=0, increment=0, increment2=0, phase=0, phase2=.07, phase3=.37;
  double detuneRatio=1, frequency=0, filterState=0, attenuation=1, panL=0, panR=0, gain=0, color=0, pan=0;
  double evolution=0, decay=0, blend=0;
  int lane=0, kind=0, model=0, family=0, trace=0;
  std::array<double,8> harmonics{}; std::array<double,4> ratios{};
  std::shared_ptr<std::vector<float>> sample, sample2, sampleRight;
};
struct Event {int type=0,lane=-1;double time=0,smoothing=.4; Voice voice; std::array<double,13> expression{};};
struct SfzEvent { double time=0; int key=0, note=0, velocity=0; bool on=false; };
struct SfzSynthDeleter { void operator()(sfizz_synth_t* p) const { if(p)sfizz_free(p); } };
struct SfzLayer { std::unique_ptr<sfizz_synth_t,SfzSynthDeleter> synth; int lane=0; double gain=0.1; };
class Core {
  double rate,duck=1,synthDuck=1,greetingAt=-INF,instrumentAt=-INF,dcL=0,dcR=0,smoothing=.4;
  uint64_t cursor=0;
  std::vector<double> levels;
  std::vector<int> kinds;
  std::array<double,3> meters{};
  std::vector<Patch> patches;
  std::vector<Effects> buses;
  std::array<double,13> expression{.35,.3,0,.33,.33,.33,.33,.33,.33,.33,.33,.33,0};
  std::array<double,13> target=expression;
  std::unordered_map<int,std::shared_ptr<std::vector<float>>> samples;
  std::vector<Voice> voices; std::vector<Event> pending;
  std::unordered_map<int,SfzLayer> sfz;
  std::vector<SfzEvent> sfzEvents;
  std::unordered_set<double> cancelled;
public:
  explicit Core(double r):rate(r) {
    if(!std::isfinite(r)||r<8000||r>96000)throw std::invalid_argument("Invalid sample rate");
  }
  double time() const {return double(cursor)/rate;}
  size_t voiceCount() const {
    size_t count=voices.size();
    for(const auto& [lane,layer]:sfz)count+=size_t(sfizz_get_num_active_voices(layer.synth.get()));
    return count;
  }
  size_t pendingCount() const {return pending.size()+sfzEvents.size();}
  void sample(int id,const float* data,size_t count) {
    samples[id]=std::make_shared<std::vector<float>>(data,data+count);
  }
  void retainSamples(const double* ids,size_t count) {
    // Sounding and pending voices retain shared ownership of their old sample.
    for(auto it=samples.begin();it!=samples.end();) {
      if(std::find(ids,ids+count,it->first)==ids+count)it=samples.erase(it);else ++it;
    }
  }
  void loadSfz(int key,int lane,const std::string& path,double gain,double tuning) {
    if(lane<0||size_t(lane)>=kinds.size())throw std::invalid_argument("Invalid SFZ lane");
    if(!std::isfinite(tuning)||tuning<200||tuning>800)throw std::invalid_argument("Invalid SFZ tuning");
    sfzEvents.erase(std::remove_if(sfzEvents.begin(),sfzEvents.end(),[key](const auto& e){return e.key==key;}),sfzEvents.end());
    if(path.empty()){sfz.erase(key);return;}
    SfzLayer layer;
    layer.synth.reset(sfizz_create_synth());
    if(!layer.synth)throw std::runtime_error("Cannot create SFZ synth");
    sfizz_set_sample_rate(layer.synth.get(),float(rate));
    sfizz_set_samples_per_block(layer.synth.get(),4096);
    sfizz_set_num_voices(layer.synth.get(),32);
    if(!sfizz_load_file(layer.synth.get(),path.c_str()))throw std::runtime_error("Cannot load SFZ: "+path);
    sfizz_set_tuning_frequency(layer.synth.get(),float(tuning));
    layer.lane=lane;layer.gain=clamp(gain,0,8);
    sfz[key]=std::move(layer);
  }
  bool hasSfz(int key) const {return sfz.find(key)!=sfz.end();}
  void scheduleSfz(double time,int key,int note,int velocity,double duration) {
    if(!hasSfz(key))throw std::invalid_argument("No SFZ layer");
    if(note<0||note>127||velocity<1||velocity>127||duration<=0)throw std::invalid_argument("Invalid SFZ note");
    sfzEvents.push_back({time,key,note,velocity,true});
    sfzEvents.push_back({time+duration,key,note,0,false});
    std::stable_sort(sfzEvents.begin(),sfzEvents.end(),[](const auto&a,const auto&b){return a.time<b.time;});
  }
  void configure(const double* p,size_t n) {
    const bool legacy=n==30;
    if(!legacy&&(n<12||(n-1)%11))throw std::invalid_argument("Invalid configuration");
    size_t count=legacy?3:(n-1)/11;
    if(count>9)throw std::invalid_argument("Too many sound slots");
    bool reset=legacy?buses.size()!=count:p[0]!=0||buses.size()!=count;
    if(reset) {
      voices.clear();pending.clear();cancelled.clear();buses.clear();
      sfz.clear();sfzEvents.clear();
      for(size_t j=0;j<count;j++)buses.emplace_back(rate);
      duck=synthDuck=1;greetingAt=instrumentAt=-INF;
    }
    levels.resize(count);kinds.resize(count);patches.resize(count);
    for(size_t j=0;j<count;j++) {
      size_t o=legacy?j*10:1+j*11+1;
      kinds[j]=legacy?int(j):int(p[o-1]);
      if(kinds[j]<0||kinds[j]>2)throw std::invalid_argument("Invalid channel kind");
      levels[j]=p[o];patches[j]={p[o+1],p[o+2],p[o+3],p[o+4],p[o+5],p[o+6],p[o+7],p[o+8],p[o+9]};
    }
  }
  void schedule(const double* p,size_t n) {
    if(n<2)throw std::invalid_argument("Invalid event");
    Event e; e.type=int(p[0]);e.time=p[1];
    if(e.type==0) {
      if(n!=41&&n!=42)throw std::invalid_argument("Invalid note");
      auto& v=e.voice;
      v.id=p[2];v.time=p[3];v.sourceTime=p[4];v.lane=int(p[5]);v.stop=p[6];v.attack=p[7];v.release=p[8];
      auto get=[&](int id){auto it=samples.find(id);return it==samples.end()?std::shared_ptr<std::vector<float>>{}:it->second;};
      v.sample=get(int(p[9]));v.sample2=get(int(p[10]));v.increment=p[11];v.increment2=p[12];
      v.detuneRatio=p[13];v.frequency=p[14];v.attenuation=p[15];v.panL=p[16];v.panR=p[17];v.gain=p[18];
      v.color=p[19];v.pan=p[20];v.model=int(p[21]);v.family=int(p[22]);v.evolution=p[23];v.decay=p[24];v.blend=p[25];v.trace=int(p[26]);
      for(int j=0;j<8;j++)v.harmonics[j]=p[27+j];
      for(int j=0;j<4;j++)v.ratios[j]=p[35+j];
      v.phase=p[39];v.phase2=p[40];
      if(n==42)v.sampleRight=get(int(p[41]));
      if(v.lane<0||size_t(v.lane)>=kinds.size())throw std::invalid_argument("Invalid lane");
      v.kind=kinds[v.lane];
    } else if(e.type==1) {
      if(n!=14&&n!=16)throw std::invalid_argument("Invalid expression");
      std::copy(p+2,p+14,e.expression.begin());
      if(n==16){e.expression[12]=clamp(p[14],-20,20);e.smoothing=std::max(.05,p[15]);}
    } else if(e.type==2) {
      if(n!=3)throw std::invalid_argument("Invalid release");e.lane=int(p[2]);
      for(const auto& [key,layer]:sfz)if(e.lane<0||e.lane==layer.lane)
        sfzEvents.push_back({e.time,key,-1,0,false});
      std::stable_sort(sfzEvents.begin(),sfzEvents.end(),[](const auto&a,const auto&b){return a.time<b.time;});
    } else throw std::invalid_argument("Invalid event type");
    pending.push_back(std::move(e));
    std::stable_sort(pending.begin(),pending.end(),[](const Event&a,const Event&b){return a.time<b.time;});
  }
  void render(float* l,float* r,size_t frames) {
    if(!sfz.empty()&&frames>4096)throw std::invalid_argument("SFZ block exceeds maximum size");
    std::unordered_map<int,std::array<std::vector<float>,2>> sfzAudio;
    const double blockEnd=time()+double(frames)/rate;
    size_t sfzUsed=0;
    for(auto& [key,layer]:sfz) {
      auto& audio=sfzAudio[key];audio[0].resize(frames);audio[1].resize(frames);
      for(const auto& e:sfzEvents) {
        if(e.time>=blockEnd)break;
        if(e.key!=key)continue;
        int delay=std::clamp(int(std::ceil((e.time-time())*rate)),0,int(frames)-1);
        if(e.note<0)sfizz_send_cc(layer.synth.get(),delay,123,0);
        else if(e.on) {
          sfizz_send_note_on(layer.synth.get(),delay,e.note,e.velocity);
          if(kinds[layer.lane]==1&&levels[layer.lane]>0)instrumentAt=e.time;
        }
        else sfizz_send_note_off(layer.synth.get(),delay,e.note,0);
      }
      float* channels[]={audio[0].data(),audio[1].data()};
      sfizz_render_block(layer.synth.get(),channels,2,int(frames));
    }
    while(sfzUsed<sfzEvents.size()&&sfzEvents[sfzUsed].time<blockEnd)sfzUsed++;
    sfzEvents.erase(sfzEvents.begin(),sfzEvents.begin()+sfzUsed);
    size_t atEvent=0;std::array<double,3> maxima{};
    double dc=1-std::exp(-TAU*18/rate),slew=1-std::exp(-1/(smoothing*rate));
    double duckAttack=1-std::exp(-1/(.08*rate)),duckRelease=1-std::exp(-1/(.8*rate));
    for(size_t i=0;i<frames;i++,cursor++) {
      double t=time();
      while(atEvent<pending.size()&&pending[atEvent].time<=t) {
        const auto& e=pending[atEvent++];
        if(e.type==0) {
          if(cancelled.erase(e.voice.id)==0) {
            int count=0;Voice* first=nullptr;
            for(auto& v:voices)if(v.lane==e.voice.lane&&v.forced==INF){count++;if(!first)first=&v;}
            int limit=e.voice.kind==0?6:e.voice.kind==1?8:6;
            if(count>=limit&&first)first->forced=t+.025;
            voices.push_back(e.voice);
            if(e.voice.kind==2)greetingAt=t;
            if(e.voice.kind==1&&levels[e.voice.lane]>0)instrumentAt=t;
          }
        } else if(e.type==1){target=e.expression;smoothing=e.smoothing;slew=1-std::exp(-1/(smoothing*rate));}
        else {
          for(auto& v:voices)if(e.lane<0||v.lane==e.lane) {
            if(v.kind==0)v.stop=std::min(v.stop,t);else v.forced=std::min(v.forced,t+.15);
          }
          for(size_t j=atEvent;j<pending.size();j++) {
            const auto& q=pending[j];
            if(q.type==0&&q.voice.sourceTime<=e.time&&(e.lane<0||q.voice.lane==e.lane))cancelled.insert(q.voice.id);
          }
        }
      }
      for(int j=0;j<13;j++)expression[j]+=(target[j]-expression[j])*slew;
      double brightness=clamp(expression[0]),energy=clamp(expression[1]);
      std::array<double,9> left{},right{};
      for(const auto& [key,audio]:sfzAudio) {
        const auto& layer=sfz.at(key);
        left[layer.lane]+=audio[0][i]*layer.gain;right[layer.lane]+=audio[1][i]*layer.gain;
      }
      for(auto& v:voices) {
        double age=t-v.time;
        if(t>std::min(v.stop+v.release,v.forced))continue;
        double envelope=(age<v.attack?smooth(age/v.attack):1)*(t<v.stop?1:1-smooth((t-v.stop)/v.release))*(v.forced==INF?1:clamp((v.forced-t)/.025));
        double value=0,rightValue=0;
        if(v.sample) {
          value=sampleAt(*v.sample,v.position);
          rightValue=v.sampleRight?sampleAt(*v.sampleRight,v.position):value;
          v.position+=v.increment*(v.model==8?1+.0018*sine(age*.27)+.0006*sine(age*4.3):1);
          if(v.sample2) {
            double other=sampleAt(*v.sample2,v.position2);
            value=value*.6+other*.4;rightValue=rightValue*.6+other*.4;v.position2+=v.increment2;
          }
        } else if(v.model==3) {
          double phase=age*v.frequency;
          value=(sine(phase+.12*sine(phase*2)*std::exp(-age*1.8))*.8+
            sine(phase*3)*.12*std::exp(-age*4))*std::exp(-age*(.6+v.color*.3));
        } else if(v.model==4) {
          value=sine(age*v.frequency)*.75*std::exp(-age*.65)
            +sine(age*v.frequency*2)*.4*std::exp(-age*1.1)
            +sine(age*v.frequency*3)*.2*std::exp(-age*1.7)
            +sine(age*v.frequency*4)*.08*std::exp(-age*2.4);
        } else if(v.model==5) {
          value=sine(48*age+2.7*(1-std::exp(-age*30)))*std::exp(-age*14);
        } else if(v.model==6||v.model==7) {
          v.noise=v.noise*1664525u+1013904223u;
          double noise=double(v.noise)/2147483648.-1;
          v.filterState+=(noise-v.filterState)*(v.model==7?.22:.42);
          value=v.model==7?(noise-v.filterState)*std::exp(-age*65)*.38:
            (v.filterState*.55+sine(age*175)*.25*std::exp(-age*18))*std::exp(-age*22);
        } else if(v.model) {
          for(int j=0;j<4;j++)if(v.frequency*v.ratios[j]<rate*.43)
            value+=sine(age*v.frequency*v.ratios[j])*std::exp(-age*(1+j*.6)/(v.model==2?2.8:1.4))*(j?.3/(j+1):1);
        } else {
          v.phase+=v.frequency/rate;v.phase-=int(v.phase);
          double livingDetune=1+std::max(.002,v.detuneRatio-1)*(.85+energy*.3);
          v.phase2+=v.frequency*livingDetune/rate;v.phase2-=int(v.phase2);
          v.phase3+=v.frequency/(livingDetune*rate);v.phase3-=int(v.phase3);
          double breathe=sine(age*v.evolution+v.color),decay=.35+.65/(1+age*v.decay);
          for(int j=0;j<8;j++) {
            if(v.frequency*(j+1)>=rate*.42)continue;
            double band=expression[3+(j+v.trace)%9],weight=j?.6+brightness*.4+band*.55:.65;
            if(v.family==1)weight*=j?decay:.8;
            else if(v.family==2)weight*=j?decay*decay:.55+decay*.45;
            else if(v.family==3)weight*=.72+.28*sine(age*v.evolution+j*.22+expression[2]*.18);
            else if(v.family==4)weight*=.86+.14*sine(age*v.evolution+j*.31);
            else if(v.family==5)weight*=j%2?.7:1+band*.25;
            else weight*=j?.84+.16*breathe:1;
            double partial=sine(v.phase*(j+1))*.4+sine(v.phase2*(j+1))*.3+sine(v.phase3*(j+1))*.3;
            value+=partial*v.harmonics[j]*weight;
          }
          value*=(.78+energy*.14+breathe*.16)*std::min(1.,std::sqrt(880/v.frequency));
          double cutoff=std::min(rate*.18,(480+v.frequency*.65+brightness*brightness*1800+energy*420)*(.82+.18*sine(age*(.035+v.evolution*.12)+v.color)));
          v.filterState+=(value-v.filterState)*(1-std::exp(-TAU*cutoff/rate));value=v.filterState;
        }
        /* Alternative wind-chime timbre (inactive).
        if(v.kind==2) {
          value=0;
          constexpr double ratios[]={1,2.76,5.4,8.93},weights[]={.65,.26,.1,.04};
          for(int k=0;k<4;k++) {
            if(v.frequency*ratios[k]<rate*.42)
              value+=(sine(age*v.frequency*ratios[k])*.7+sine(age*v.frequency*ratios[k]*1.0015)*.3)*std::exp(-age/(.48/(1+k*1.2)))*weights[k];
          }
        }
        */
        if(v.model==8||v.model==3) {
          double cutoff=1600+v.color*1800;
          v.filterState+=(value-v.filterState)*(1-std::exp(-TAU*cutoff/rate));
          value=std::tanh(v.filterState*1.35)/1.35;
        }
        value*=envelope*v.gain;rightValue*=envelope*v.gain;
        if(v.kind==0) {
          double drift=expression[2]*.13+sine(age*.08+v.pan)*.05;
          left[v.lane]+=value*v.panL*(1-drift);right[v.lane]+=(v.sample?rightValue:value)*v.panR*(1+drift);
        } else {left[v.lane]+=value*v.panL;right[v.lane]+=(v.sample?rightValue:value)*v.panR;}
      }
      double duckTarget=t-greetingAt<.65&&!levels.empty()&&levels.back()>0?.85:1;
      duck+=(duckTarget-duck)*(duckTarget<duck?duckAttack:duckRelease);
      bool audibleInstrument=false;
      for(size_t j=0;j<levels.size();j++)if(kinds[j]==1&&levels[j]>0)audibleInstrument=true;
      double synthDuckTarget=t>=instrumentAt&&t-instrumentAt<.32&&audibleInstrument?.88:1;
      synthDuck+=(synthDuckTarget-synthDuck)*(synthDuckTarget<synthDuck?duckAttack:duckRelease);
      double outL=0,outR=0;
      for(size_t j=0;j<levels.size();j++) {
        int kind=kinds[j];
        auto b=buses[j].process(left[j],right[j],patches[j],kind==0?energy:0,kind<2?expression[12]:0);
        double gain=levels[j]*(kind<2?duck:1)*(kind==0?synthDuck:1);
        outL+=b[0]*gain;outR+=b[1]*gain;
        maxima[kind]=std::max(maxima[kind],std::max(std::abs(b[0]*gain),std::abs(b[1]*gain)));
      }
      dcL+=(outL-dcL)*dc;dcR+=(outR-dcR)*dc;
      l[i]=outputSample((outL-dcL)*MASTER_GAIN);
      r[i]=outputSample((outR-dcR)*MASTER_GAIN);
      if(cursor%128==0)voices.erase(std::remove_if(voices.begin(),voices.end(),[t](const Voice&v){return !(t<std::min(v.stop+v.release,v.forced));}),voices.end());
    }
    pending.erase(pending.begin(),pending.begin()+atEvent);
    for(int j=0;j<3;j++)meters[j]=std::max(maxima[j],meters[j]*.92);
  }
};
} // namespace sonora
