#include "../../modules/plantia-pcm/cpp/Sonora.h"
#include <fstream>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <vector>

// Offline adapter for the exact C++ Core used by PlantiaPcm on device.
// Text protocol: rate/duration, then C configuration, L SFZ, E DSP, S SFZ event.
int main(int argc, char** argv) {
  try {
    if (argc != 3) throw std::runtime_error("usage: plantia-mood-render score.txt audio.f32");
    std::ifstream input(argv[1]);
    std::ofstream output(argv[2], std::ios::binary);
    if (!input || !output) throw std::runtime_error("Cannot open score or audio output");
    int rate = 0; double duration = 0;
    input >> rate >> duration;
    sonora::Core core(rate);
    std::string line;
    std::getline(input, line);
    while (std::getline(input, line)) {
      if (line.empty()) continue;
      std::istringstream stream(line);
      char command; stream >> command;
      if (command == 'C' || command == 'E') {
        std::vector<double> values; double value;
        while (stream >> value) values.push_back(value);
        if (command == 'C') core.configure(values.data(), values.size());
        else core.schedule(values.data(), values.size());
      } else if (command == 'L') {
        int key, lane; double gain, tuning; std::string path;
        stream >> key >> lane >> gain >> tuning >> std::quoted(path);
        core.loadSfz(key, lane, path, gain, tuning);
      } else if (command == 'S') {
        double time, duration; int key, midi, velocity;
        stream >> time >> key >> midi >> velocity >> duration;
        core.scheduleSfz(time, key, midi, velocity, duration);
      } else throw std::runtime_error("Unknown score command");
      if ((command == 'L' || command == 'S') && !stream) throw std::runtime_error("Malformed score line");
    }
    const size_t frames = static_cast<size_t>(std::ceil((duration + 2.5) * rate));
    std::vector<float> left(1024), right(1024), interleaved(2048);
    for (size_t at = 0; at < frames; at += 1024) {
      size_t count = std::min(size_t(1024), frames - at);
      core.render(left.data(), right.data(), count);
      for (size_t i = 0; i < count; ++i) {
        interleaved[2*i] = left[i]; interleaved[2*i+1] = right[i];
      }
      output.write(reinterpret_cast<const char*>(interleaved.data()), count * 2 * sizeof(float));
    }
  } catch (const std::exception& error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}
