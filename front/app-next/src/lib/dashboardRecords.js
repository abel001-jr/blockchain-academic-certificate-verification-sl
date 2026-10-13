import { api } from "./api";

export async function loadDashboardRecords(path) {
  const rows = [];
  let page = 1;
  let response;
  do {
    response = await api.get(`${path}${path.includes("?") ? "&" : "?"}page_size=100&page=${page++}`);
    rows.push(...(response.results ?? response));
  } while (response.next);
  return rows;
}
