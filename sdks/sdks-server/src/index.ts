export async function fetchJsonServer<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error('Server SDK fetch error', response.status, response.statusText);
      return null;
    }
    const data = (await response.json()) as T;
    return data;
  } catch (err) {
    console.error('Server SDK fetch exception', err);
    return null;
  }
}
