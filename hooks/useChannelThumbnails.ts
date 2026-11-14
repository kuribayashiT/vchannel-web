"use client";

import { useEffect, useState } from "react";

let thumbnailCache: Record<string, string> | null = null;
let thumbnailRequest: Promise<Record<string, string>> | null = null;

export function useChannelThumbnails(): Record<string, string> | null {
  const [thumbnails, setThumbnails] =
    useState<Record<string, string> | null>(null);

  useEffect(() => {
    if (!thumbnailRequest) {
      const request = thumbnailCache
        ? Promise.resolve(thumbnailCache)
        : fetch("/api/office-thumbnails").then((res) =>
            res.ok
              ? (res.json() as Promise<Record<string, string>>)
              : Promise.reject(new Error(`HTTP ${res.status}`)),
          );
      thumbnailRequest = request
        .then((data) => {
          thumbnailCache = data;
          return data;
        })
        .catch((error) => {
          console.error("Failed to fetch office thumbnails", error);
          thumbnailCache = {};
          return {};
        })
        .finally(() => {
          thumbnailRequest = null;
        });
    }

    let cancelled = false;
    thumbnailRequest.then((data) => {
      if (!cancelled) setThumbnails(data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return thumbnails;
}
