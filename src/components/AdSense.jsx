import { useEffect } from "react";

export default function AdSense() {
  useEffect(() => {
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (e) {
      // console.error(e);
    }
  }, []);

  return (
    <>
      <ins
        className="adsbygoogle"
        style={{ display: "block" }}
        data-ad-client="ca-pub-XXXXXXXXXX" // Reemplaza con tu ID de cliente
        data-ad-slot="YYYYYYYYYY"          // Reemplaza con tu ID de anuncio
        data-ad-format="auto"
        data-full-width-responsive="true"
      ></ins>
    </>
  );
}
