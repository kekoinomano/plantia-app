package expo.modules.saviasoundvideo

import java.io.File
import java.io.RandomAccessFile

class WavFile(private val file: File, private val rate: Int) {
  private val output = RandomAccessFile(file, "rw")
  private var frames = 0L

  init { output.setLength(44); output.seek(44) }

  @Synchronized fun append(atFrame: Long, pcm: ByteArray) {
    if (pcm.size % 4 != 0) return
    val start = maxOf(0, atFrame)
    if (start > frames) {
      output.seek(44 + frames * 4)
      var gap = start - frames
      val zeros = ByteArray(8192)
      while (gap > 0) {
        val count = minOf(gap * 4, zeros.size.toLong()).toInt()
        output.write(zeros, 0, count)
        gap -= count / 4
      }
      frames = start
    }
    val skipped = maxOf(0, frames - atFrame).toInt() * 4
    if (skipped >= pcm.size) return
    output.seek(44 + frames * 4)
    output.write(pcm, skipped, pcm.size - skipped)
    frames += (pcm.size - skipped) / 4
  }

  @Synchronized fun finish(durationFrames: Long) {
    frames = maxOf(1, durationFrames)
    output.setLength(44 + frames * 4)
    output.seek(0)
    fun word(v: Int) { output.write(v and 255); output.write((v ushr 8) and 255) }
    fun dword(v: Int) { word(v and 65535); word(v ushr 16) }
    output.writeBytes("RIFF"); dword((36 + frames * 4).toInt()); output.writeBytes("WAVEfmt ")
    dword(16); word(1); word(2); dword(rate); dword(rate * 4); word(4); word(16)
    output.writeBytes("data"); dword((frames * 4).toInt())
    output.close()
  }

  @Synchronized fun cancel() { output.close(); file.delete() }
}
