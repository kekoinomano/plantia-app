#pragma once
#include "Sonora.h"
#include <mutex>
namespace sonora {
// All module calls are synchronous on JS, with a lock also protecting teardown.
inline std::mutex storeMutex;
inline std::unordered_map<int,std::unique_ptr<Core>> engines;
inline int nextId=1;
inline int create(double rate) {
  if(!std::isfinite(rate)||rate<8000||rate>96000)throw std::invalid_argument("Invalid sample rate");
  int id=nextId++; engines[id]=std::make_unique<Core>(rate);return id;
}
inline Core& get(int id) {return *engines.at(id);}
}
