export async function fetchJsonClient<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error('Client SDK fetch error', response.status, response.statusText);
      return null;
    }
    const data = (await response.json()) as T;
    return data;
  } catch (err) {
    console.error('Client SDK fetch exception', err);
    return null;
  }
}
