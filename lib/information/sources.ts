export type InformationFeedSource = {
  key: string;
  label: string;
  url: string;
  strictBusinessFilter?: boolean;
};

export const INFORMATION_FEED_SOURCES: InformationFeedSource[] = [
  {
    key: "36kr",
    label: "36氪",
    url: "https://36kr.com/feed",
  },
  {
    key: "ifanr",
    label: "爱范儿",
    url: "https://www.ifanr.com/feed",
  },
  {
    key: "leiphone",
    label: "雷峰网",
    url: "https://www.leiphone.com/feed",
  },
  {
    key: "tmtpost",
    label: "钛媒体",
    url: "https://www.tmtpost.com/rss.xml",
  },
  {
    key: "ftchinese",
    label: "FT中文网",
    url: "https://www.ftchinese.com/rss/feed",
    strictBusinessFilter: true,
  },
];
