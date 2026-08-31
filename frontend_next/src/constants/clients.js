/**
 * Mapping các mã khách hàng (Client) sang short_name dùng cho Database
 */
export const CLIENT_SHORT_NAME_MAP = {
  "bun-nsw-act": "BUN-NSW-ACT",
  "cairns-hardware": "CAIRNS-WOH",
  "bunnings-qld": "BUN-QLD",
  "bun-vic": "BUN-VIC",
  "bun-seqld": "BUN-SEQLD",
  "bun-sa": "BUN-SA",
  "bun-tas": "BUN-TAS",
  "ats-ft": "ATS-FT"
};

/**
 * Lấy short_name của Client đang được chọn trên giao diện
 */
export const getActiveClientShortName = () => {
  try {
    const clientKey = (typeof window !== "undefined" && (localStorage.getItem("selectedCustomerClient") || sessionStorage.getItem("selectedCustomerClient"))) || "bun-nsw-act";
    return CLIENT_SHORT_NAME_MAP[clientKey] || "BUN-NSW-ACT";
  } catch (_) {
    return "BUN-NSW-ACT";
  }
};
