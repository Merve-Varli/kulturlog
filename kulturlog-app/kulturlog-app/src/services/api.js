/**
 * @file api.js
 * @description KültürLog projesinin merkezi servis katmanı (Open Library & TMDB).
 */

const TMDB_TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJlNDEyNTYzNWMzNDNkYmIxODY0Zjk1NjE4MjdmYmFhNSIsIm5iZiI6MTc3NzkwMjEzNy4zMDQ5OTk4LCJzdWIiOiI2OWY4YTIzOWJlMWZjMTRjNjlmNTIwY2IiLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.Sgovcb5HEBheBy8MivFfNAamgtRbNR18HMSsb6BUanE";

/**
 * Film Araması (TMDB)
 */
export const searchMovies = async (query) => {
  try {
    const url = `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(query)}&language=tr-TR`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${TMDB_TOKEN}` }
    });
    const data = await response.json();
    return data.results || [];
  } catch (error) {
    console.error("TMDB Film Arama Hatası:", error);
    return [];
  }
};

/**
 * Dizi Araması (TMDB) - YENİ EKLENEN KISIM
 */
export const searchTvSeries = async (query) => {
  try {
    const url = `https://api.themoviedb.org/3/search/tv?query=${encodeURIComponent(query)}&language=tr-TR`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${TMDB_TOKEN}` }
    });
    const data = await response.json();
    return data.results || [];
  } catch (error) {
    console.error("TMDB Dizi Arama Hatası:", error);
    return [];
  }
};

/**
 * Kitap Araması (Open Library API) - ANAHTAR GEREKTİRMEZ
 */
export const searchBooks = async (query) => {
  try {
    // Open Library arama adresi
    const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}`;
    
    const response = await fetch(url);
    const data = await response.json();

    // Open Library verilerini bizim uygulamanın formatına (Google formatına benzer) çeviriyoruz
    const formattedBooks = data.docs.slice(0, 20).map(book => ({
      id: book.key,
      volumeInfo: {
        title: book.title,
        authors: book.author_name || ["Bilinmeyen Yazar"],
        // Kitap kapağı için Open Library'nin görsel servisini kullanıyoruz
        imageLinks: {
          thumbnail: book.cover_i 
            ? `https://covers.openlibrary.org/b/id/${book.cover_i}-M.jpg` 
            : "https://via.placeholder.com/128x192?text=Kitap+Kapagi+Yok"
        },
        description: book.first_sentence ? book.first_sentence[0] : "Açıklama bulunamadı.",
        publishedDate: book.first_publish_year
      }
    }));

    return formattedBooks;
  } catch (error) {
    console.error("Open Library Hatası:", error);
    return [];
  }
};