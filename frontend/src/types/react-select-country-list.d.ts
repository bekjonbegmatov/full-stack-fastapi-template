declare module "react-select-country-list" {
  type Country = { value: string; label: string }
  export default function countryList(): { getData(): Country[] }
}
