import * as Utils from "./utils";
import type {
  ManifestLoadedData,
  LevelUpdatedData,
  AudioTrackLoadedData,
} from "hls.js";
import { Core, Segment } from "p2p-media-loader-core";

export class SegmentManager {
  core: Core;

  constructor(core: Core) {
    this.core = core;
  }

  processMainManifest(data: ManifestLoadedData) {
    const { levels, audioTracks } = data;
    // in the case of audio only stream it is stored in levels

    for (const [index, level] of levels.entries()) {
      const { url } = level;
      this.core.addStreamIfNoneExists({
        runtimeId: Array.isArray(url) ? (url as string[])[0] : url,
        type: "main",
        index,
      });
    }

    for (const [index, track] of audioTracks.entries()) {
      const { url } = track;
      this.core.addStreamIfNoneExists({
        runtimeId: Array.isArray(url) ? (url as string[])[0] : url,
        type: "secondary",
        index,
      });
    }
  }

  updatePlaylist(data: LevelUpdatedData | AudioTrackLoadedData) {
    if (!data.details) return;
    const {
      details: { url, fragments, live },
    } = data;

    const playlist = this.core.getStream(url);
    if (!playlist) return;

    const segmentToRemoveIds = new Set(playlist.segments.keys());
    const newSegments: Segment[] = [];
    fragments.forEach((fragment, index) => {
      const {
        url: responseUrl,
        byteRange: fragByteRange,
        sn,
        start: startTime,
        end: endTime,
      } = fragment;
      if (sn === "initSegment") return;

      const [start, end] = fragByteRange;
      const byteRange = Utils.getByteRange(
        start,
        end !== undefined ? end - 1 : undefined,
      );
      const runtimeId = Utils.getSegmentRuntimeId(responseUrl, byteRange);
      segmentToRemoveIds.delete(runtimeId);

      if (playlist.segments.has(runtimeId)) return;
      newSegments.push({
        runtimeId,
        url: responseUrl,
        externalId: live ? sn : index,
        byteRange,
        startTime,
        endTime,
      });
    });

    if (!newSegments.length && !segmentToRemoveIds.size) return;
    this.core.updateStream(url, newSegments, segmentToRemoveIds.values());
  }
}
