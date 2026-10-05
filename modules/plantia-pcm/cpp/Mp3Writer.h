#pragma once
#include "Sonora.h"
#include "lame.h"
#include <algorithm>
#include <array>
#include <cmath>
#include <cstdio>
#include <stdexcept>
#include <string>

namespace sonora {
// One offline writer per Core. PCM never crosses the JS/native bridge.
class Mp3Writer {
  std::string path, partial;
  FILE* file = nullptr;
  lame_t encoder = nullptr;
  bool committed = false;
  std::array<float, 4096> left{}, right{};
  std::array<short, 4096> pcmLeft{}, pcmRight{};
  std::array<unsigned char, 65536> encoded{};

  void write(int size) {
    if (size < 0) throw std::runtime_error("MP3 encoder failed: " + std::to_string(size));
    if (size && std::fwrite(encoded.data(), 1, size_t(size), file) != size_t(size))
      throw std::runtime_error("Could not write MP3 file");
  }
public:
  Mp3Writer(const std::string& output, int rate):path(output),partial(output+".part") {
    if (path.empty() || rate != 44100) throw std::invalid_argument("Invalid MP3 output configuration");
    encoder = lame_init();
    if (!encoder) throw std::runtime_error("Could not start MP3 encoder");
    if (lame_set_num_channels(encoder, 2) < 0 || lame_set_in_samplerate(encoder, rate) < 0 ||
        lame_set_brate(encoder, 192) < 0 || lame_set_mode(encoder, JOINT_STEREO) < 0 ||
        lame_set_quality(encoder, 5) < 0 || lame_set_bWriteVbrTag(encoder, 0) < 0 ||
        lame_init_params(encoder) < 0) {
      lame_close(encoder); encoder = nullptr;
      throw std::runtime_error("Could not configure MP3 encoder");
    }
    file = std::fopen(partial.c_str(), "wb");
    if (!file) { lame_close(encoder); encoder = nullptr; throw std::runtime_error("Could not create MP3 file"); }
  }
  ~Mp3Writer() {
    if (file) std::fclose(file);
    if (encoder) lame_close(encoder);
    if (!committed) std::remove(partial.c_str());
  }
  void render(Core& core, int frames) {
    if (frames < 1 || frames > 44100) throw std::invalid_argument("Invalid MP3 chunk size");
    while (frames > 0) {
      const int count = std::min(frames, 4096);
      core.render(left.data(), right.data(), size_t(count));
      for (int i=0; i<count; i++) {
        auto convert=[](float value) -> short {
          return short(std::lround(std::clamp(double(value), -1.0, 1.0) * (value < 0 ? 32768.0 : 32767.0)));
        };
        pcmLeft[i] = convert(left[i]); pcmRight[i] = convert(right[i]);
      }
      write(lame_encode_buffer(encoder, pcmLeft.data(), pcmRight.data(), count,
        encoded.data(), int(encoded.size())));
      frames -= count;
    }
  }
  void finish() {
    write(lame_encode_flush(encoder, encoded.data(), int(encoded.size())));
    if (std::fclose(file) != 0) { file=nullptr; throw std::runtime_error("Could not finish MP3 file"); }
    file=nullptr;
    if (std::rename(partial.c_str(), path.c_str()) != 0) throw std::runtime_error("Could not save MP3 file");
    committed=true;
  }
};
} // namespace sonora
