/** Public OCR staff headshots from https://ocr.ucsf.edu/people */

export type OcrPersonPhoto = {
  name: string;
  photoUrl: string;
  profilePath: string;
};

/**
 * Curated from the OCR website CDN (square/headshot assets).
 * Update when the People page changes.
 */
export const OCR_PEOPLE_PHOTOS: OcrPersonPhoto[] = [
  {
    name: "Vincent Chan",
    profilePath: "/people/vincent-chan",
    photoUrl:
      "https://cdn.prod.website-files.com/650b3d699bff4365148c044d/65416ad80872191ec700a334_NEW_VincentChan_square.jpg",
  },
  {
    name: "Corey Rathe",
    profilePath: "/people/corey-rathe",
    photoUrl:
      "https://cdn.prod.website-files.com/650b3d699bff4365148c044d/654ab2894afc4f8e539cf443_NEW_CoreyRathe_square.jpg",
  },
  {
    name: "Francisco Quintanilla",
    profilePath: "/people/francisco-quintanilla",
    photoUrl:
      "https://cdn.prod.website-files.com/650b3d699bff4365148c044d/6543fd8223be8586b23f4bc1_NEW_FranciscoQuintanilla.jpg",
  },
  {
    name: "Lina Kamil",
    profilePath: "/people/lina-kamil",
    photoUrl:
      "https://cdn.prod.website-files.com/650b3d699bff4365148c044d/65c14ca27abb2cd11efb62ff_NEW_LinaKamil_square.jpg",
  },
  {
    name: "Michelle Yu",
    profilePath: "/people/michelle-yu",
    photoUrl:
      "https://cdn.prod.website-files.com/650b3d699bff4365148c044d/659dd35191c104a4a3717d4a_NEW_MichelleYu_square.jpg",
  },
  {
    name: "Xochitl Vargas",
    profilePath: "/people/xochitl-vargas",
    photoUrl:
      "https://cdn.prod.website-files.com/650b3d699bff4365148c044d/6543fe3c72975bbfc58e54a0_NEW_XochitlVargas_square.jpg",
  },
  {
    name: "Jonathan Wilson",
    profilePath: "/people/jonathan-wilson",
    photoUrl:
      "https://cdn.prod.website-files.com/650b3d699bff4365148c044d/6543fdce6b92af2ffac72519_NEW_JonathonWilson_square.jpg",
  },
  {
    name: "Gabe Murphy",
    profilePath: "/people/gabe-murphy",
    photoUrl:
      "https://cdn.prod.website-files.com/650b3d699bff4365148c044d/65c14c8afdbf7fb4af6716d6_NEW_GabeMurphy_square.jpg",
  },
  {
    name: "Natalia Dikinov",
    profilePath: "/people/natalia-dikinov",
    photoUrl:
      "https://cdn.prod.website-files.com/650b3d699bff4365148c044d/67899e32bf2ea681a095605b_NEW_NataliaDikinov_square.jpg",
  },
  {
    name: "Lily Ortiz",
    profilePath: "/people/lily-ortiz",
    photoUrl:
      "https://cdn.prod.website-files.com/650b3d699bff4365148c044d/6790365341f428b5425408b7_NEW_LilyOrtiz_square.jpg",
  },
  {
    name: "Reid Bolus",
    profilePath: "/people/reid-bolus",
    photoUrl:
      "https://cdn.prod.website-files.com/650b3d699bff4365148c044d/679038625c1b7a94f0453f52_NEW_ReidBolus_square.jpg",
  },
];
