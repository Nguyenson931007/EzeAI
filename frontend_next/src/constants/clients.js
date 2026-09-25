/**
 * Mapping các mã khách hàng (Client) sang short_name dùng cho Database
 */
export const CLIENT_SHORT_NAME_MAP = {
  "bun-nsw-act": "BUN-NSW-ACT",
  "cairns-hardware": "CAIRNS-WOH",
  "bunnings-qld": "BUN-SEQLD",
  "bun-vic": "BUN-VIC",
  "bun-seqld": "BUN-SEQLD",
  "bun-sa": "BUN-SA",
  "bun-tas": "BUN-TAS",
  "ats-ft": "ATS-FT"
};
export const CLIENT_DISPLAY_NAME_MAP = {
  "bun-nsw-act": "Bunnings NSW / ACT",
  "cairns-hardware": "Cairns Hardware",
  "bunnings-qld": "Bunnings QLD",
  "bun-vic": "Bunnings VIC",
  "bun-seqld": "Bunnings SEQLD",
  "bun-sa": "Bunnings SA",
  "bun-tas": "Bunnings TAS",
  "ats-ft": "ATS - FT"
};

export const getActiveClientKey = () => {
  try {
    return (typeof window !== "undefined" && (localStorage.getItem("selectedCustomerClient") || sessionStorage.getItem("selectedCustomerClient"))) || "bun-nsw-act";
  } catch (_) {
    return "bun-nsw-act";
  }
};

export const getActiveClientInfo = () => {
  const key = getActiveClientKey();
  return {
    key,
    shortName: CLIENT_SHORT_NAME_MAP[key] || "BUN-NSW-ACT",
    displayName: CLIENT_DISPLAY_NAME_MAP[key] || CLIENT_SHORT_NAME_MAP[key] || "Bunnings NSW / ACT",
  };
};

/**
 * Lấy short_name của Client đang được chọn trên giao diện
 */
export const getActiveClientShortName = () => {
  try {
    return getActiveClientInfo().shortName;
  } catch (_) {
    return "BUN-NSW-ACT";
  }
};
