import { Coordinates, DivisionName } from '../types/outera';

export interface DistrictInfo {
  name: string;
  division: DivisionName;
  coords: Coordinates;
  popularAreas: string[];
}

export interface DivisionInfo {
  name: DivisionName;
  capital: string;
  coords: Coordinates;
  districts: DistrictInfo[];
}

export const BANGLADESH_DIVISIONS: DivisionInfo[] = [
  {
    name: 'Dhaka',
    capital: 'Dhaka City',
    coords: { lat: 23.8103, lng: 90.4125 },
    districts: [
      {
        name: 'Dhaka',
        division: 'Dhaka',
        coords: { lat: 23.8103, lng: 90.4125 },
        popularAreas: [
          'Dhanmondi Lake District',
          'Banani Road 11',
          'Gulshan 2 Avenue',
          'Uttara Sector 3 & 7',
          'Old Dhaka Heritage Walk',
          'Bashundhara R/A',
          'Mirpur DOHS',
          'Lalmatia Block C',
        ],
      },
      {
        name: 'Gazipur',
        division: 'Dhaka',
        coords: { lat: 24.0023, lng: 90.4264 },
        popularAreas: ['Bhawal National Park', 'Chowrasta', 'Kapasia River Trails', 'Tongi Riverbank'],
      },
      {
        name: 'Narayanganj',
        division: 'Dhaka',
        coords: { lat: 23.6238, lng: 90.5000 },
        popularAreas: ['Sonargaon Folk Art Village', 'Panam Nagar Heritage City', 'Shitalakshya Riverfront'],
      },
      {
        name: 'Tangail',
        division: 'Dhaka',
        coords: { lat: 24.2513, lng: 89.9167 },
        popularAreas: ['Porabari Chumchum Lane', 'Madhupur Pine Forest', 'Mohera Jamidar Bari'],
      },
      {
        name: 'Kishoreganj',
        division: 'Dhaka',
        coords: { lat: 24.4449, lng: 90.7766 },
        popularAreas: ['Nikli Haor All-Weather Road', 'Gurudayal College Field', 'Jangalbari Fort'],
      },
      {
        name: 'Manikganj',
        division: 'Dhaka',
        coords: { lat: 23.8644, lng: 90.0047 },
        popularAreas: ['Baliati Palace', 'Aricha Ghat Sunset Strip', 'Tekerhat Riverbend'],
      },
      {
        name: 'Munshiganj',
        division: 'Dhaka',
        coords: { lat: 23.5422, lng: 90.5305 },
        popularAreas: ['Idrakpur Fort', 'Mawa Ghat Padma Bridge Pier', 'Rampal Dighi'],
      },
      {
        name: 'Narsingdi',
        division: 'Dhaka',
        coords: { lat: 23.9193, lng: 90.7176 },
        popularAreas: ['Wari-Bateshwar Ancient Fort', 'Dream Holiday Greenery', 'Shibpur Orchards'],
      },
      {
        name: 'Faridpur',
        division: 'Dhaka',
        coords: { lat: 23.6071, lng: 89.8429 },
        popularAreas: ['Jasmin Garden', 'Padma Riverside Promenade', 'Riverview Ghat'],
      },
      {
        name: 'Gopalganj',
        division: 'Dhaka',
        coords: { lat: 23.0051, lng: 89.8266 },
        popularAreas: ['Tungipara Waterfront', 'Madhumati River Bend', 'Ulpur Zamindar Palace'],
      },
      {
        name: 'Madaripur',
        division: 'Dhaka',
        coords: { lat: 23.1641, lng: 90.1897 },
        popularAreas: ['Shakuni Lake Park', 'Arial Khan River Deck', 'Mustafapur Gardens'],
      },
      {
        name: 'Rajbari',
        division: 'Dhaka',
        coords: { lat: 23.7574, lng: 89.6445 },
        popularAreas: ['Daulatdia Padma Ghat', 'Goalanda Pier', 'Kalyanpur Dighi'],
      },
      {
        name: 'Shariatpur',
        division: 'Dhaka',
        coords: { lat: 23.2423, lng: 90.4348 },
        popularAreas: ['Kirtinasa River Boardwalk', 'Naria Padma Bundh', 'Fatehabad Greens'],
      },
    ],
  },
  {
    name: 'Chattogram',
    capital: 'Chattogram City',
    coords: { lat: 22.3569, lng: 91.7832 },
    districts: [
      {
        name: 'Chattogram',
        division: 'Chattogram',
        coords: { lat: 22.3569, lng: 91.7832 },
        popularAreas: [
          'Patenga Naval Point & Sunset Pier',
          'GEC Circle Rooftops',
          'CRB Heritage Forest Trail',
          'Bhatiari Hill Lake',
          'Agrabad Commercial Strip',
          'Foy’s Lake Nature Nook',
        ],
      },
      {
        name: 'Cox’s Bazar',
        division: 'Chattogram',
        coords: { lat: 21.4272, lng: 92.0058 },
        popularAreas: [
          'Inani Marine Drive Surf Shack',
          'Himchari Secret Beach Camp',
          'Kolatoli Sunset Strip',
          'Sugandha Night Market',
          'Laboni Wave Point',
          'Mermaid Eco Bay',
        ],
      },
      {
        name: 'Rangamati',
        division: 'Chattogram',
        coords: { lat: 22.6533, lng: 92.1753 },
        popularAreas: [
          'Kaptai Lake Kayak Anchorage',
          'Polwel Nature Pier',
          'Tribal Textile Alley',
          'Hanging Bridge Vista Point',
          'Shuvolong Waterfall Nook',
        ],
      },
      {
        name: 'Bandarban',
        division: 'Chattogram',
        coords: { lat: 22.1953, lng: 92.2184 },
        popularAreas: [
          'Nilgiri Cloud Peak Deck',
          'Boga Lake Alpine Camp',
          'Nafakhum Stream Walk',
          'Chimbuk Hilltop Lookout',
          'Golden Temple Ridge',
        ],
      },
      {
        name: 'Khagrachhari',
        division: 'Chattogram',
        coords: { lat: 23.1193, lng: 91.9847 },
        popularAreas: ['Sajek Valley Cloud Ridge', 'Alutila Mysterious Cave', 'Richhang Falls Basecamp'],
      },
      {
        name: 'Cumilla',
        division: 'Chattogram',
        coords: { lat: 23.4607, lng: 91.1809 },
        popularAreas: ['Mainamati Shalban Vihara', 'Dharmasagar Dighi Bank', 'Kandirpar Sweet Lane'],
      },
      {
        name: 'Feni',
        division: 'Chattogram',
        coords: { lat: 23.0159, lng: 91.3976 },
        popularAreas: ['Muhuri Regulator Lake Pier', 'Trishondhya Eco Park', 'Bijoy Singh Dighi'],
      },
      {
        name: 'Brahmanbaria',
        division: 'Chattogram',
        coords: { lat: 23.9571, lng: 91.1119 },
        popularAreas: ['Titas Gas Riverfront', 'Kailash Tila Hill', 'Ustad Alauddin Khan Sangeet Nook'],
      },
      {
        name: 'Noakhali',
        division: 'Chattogram',
        coords: { lat: 22.8696, lng: 91.0994 },
        popularAreas: ['Nijhum Dwip Deer Reserve', 'Maijdee Town Lake', 'Gandhi Ashram Peace Walk'],
      },
      {
        name: 'Lakshmipur',
        division: 'Chattogram',
        coords: { lat: 22.9425, lng: 90.8412 },
        popularAreas: ['Meghna River Fishing Estuary', 'Dalal Bazar Palace', 'Alexander Embankment'],
      },
      {
        name: 'Chandpur',
        division: 'Chattogram',
        coords: { lat: 23.2333, lng: 90.6667 },
        popularAreas: ['Mollahead Three River Confluence', 'Hilsa Heritage Ghat', 'Boro Station Sunset Strip'],
      },
    ],
  },
  {
    name: 'Sylhet',
    capital: 'Sylhet City',
    coords: { lat: 24.8949, lng: 91.8687 },
    districts: [
      {
        name: 'Sylhet',
        division: 'Sylhet',
        coords: { lat: 24.8949, lng: 91.8687 },
        popularAreas: [
          'Jaflong Stone River Lounge',
          'Ratargul Freshwater Swamp Forest',
          'Bholaganj White Stone Pier',
          'Zindabazar Artisan Rooftops',
          'Shah Jalal Dargah Gateway',
        ],
      },
      {
        name: 'Moulvibazar',
        division: 'Sylhet',
        coords: { lat: 24.4829, lng: 91.7774 },
        popularAreas: [
          'Sreemangal Seven-Layer Tea Garden',
          'Lawachara Rainforest Canopy Walk',
          'Madhabkunda Waterfall Trail',
          'Hamham Forest Base',
        ],
      },
      {
        name: 'Sunamganj',
        division: 'Sylhet',
        coords: { lat: 25.0658, lng: 91.3950 },
        popularAreas: [
          'Tanguar Haor Houseboat Anchorage',
          'Shimul Bagan Bloom Grove',
          'Jadukata River Glass Waterfront',
        ],
      },
      {
        name: 'Habiganj',
        division: 'Sylhet',
        coords: { lat: 24.3749, lng: 91.4155 },
        popularAreas: ['Satchari National Park', 'Rema-Kalenga Wildlife Sanctuary', 'Baniachong Historic Village'],
      },
    ],
  },
  {
    name: 'Rajshahi',
    capital: 'Rajshahi City',
    coords: { lat: 24.3636, lng: 88.6241 },
    districts: [
      {
        name: 'Rajshahi',
        division: 'Rajshahi',
        coords: { lat: 24.3636, lng: 88.6241 },
        popularAreas: [
          'Padma River Char Breeze & Silk Loom Nook',
          'T-Dam Sunset Boardwalk',
          'Varendra Research Museum Square',
          'Shaheb Bazar Tea Circle',
        ],
      },
      {
        name: 'Bogura',
        division: 'Rajshahi',
        coords: { lat: 24.8465, lng: 89.3777 },
        popularAreas: ['Mahasthangarh Citadel Steps', 'Gokul Medh (Behula Basor)', 'Karatoya Curd Lane'],
      },
      {
        name: 'Pabna',
        division: 'Rajshahi',
        coords: { lat: 24.0064, lng: 89.2372 },
        popularAreas: ['Hardinge Bridge Riverside View', 'Paksey Railway Park', 'Anukulchandra Ashram'],
      },
      {
        name: 'Sirajganj',
        division: 'Rajshahi',
        coords: { lat: 24.4534, lng: 89.7008 },
        popularAreas: ['Bangabandhu Bridge Hard Point', 'Jamuna River Eco Bundh', 'Elliot Bridge'],
      },
      {
        name: 'Naogaon',
        division: 'Rajshahi',
        coords: { lat: 24.7936, lng: 88.9318 },
        popularAreas: ['Somapura Mahavihara (Paharpur)', 'Kusumba Mosque Terraces', 'Dibar Dighi'],
      },
      {
        name: 'Natore',
        division: 'Rajshahi',
        coords: { lat: 24.4206, lng: 88.9324 },
        popularAreas: ['Uttara Ganabhaban Palace Gardens', 'Rani Bhabani Rajbari', 'Kachagolla Sweet Market'],
      },
      {
        name: 'Chapainawabganj',
        division: 'Rajshahi',
        coords: { lat: 24.5965, lng: 88.2776 },
        popularAreas: ['Choto Sona Mosque Heritage Courtyard', 'Mahananda River Walk', 'Shibganj Mango Orchards'],
      },
      {
        name: 'Joypurhat',
        division: 'Rajshahi',
        coords: { lat: 25.1015, lng: 89.0270 },
        popularAreas: ['Lockma Rajbari', 'Hili Land Port Edge', 'Nandail Dighi Park'],
      },
    ],
  },
  {
    name: 'Khulna',
    capital: 'Khulna City',
    coords: { lat: 22.8456, lng: 89.5403 },
    districts: [
      {
        name: 'Khulna',
        division: 'Khulna',
        coords: { lat: 22.8456, lng: 89.5403 },
        popularAreas: [
          'Sundarbans Mangrove Edge Boardwalk',
          'Rupsha Bridge Sunset Pier',
          'Shiromoni Chui Jhal Alley',
          'Gollamari Memorial Lake',
        ],
      },
      {
        name: 'Bagerhat',
        division: 'Khulna',
        coords: { lat: 22.6516, lng: 89.7859 },
        popularAreas: ['Sixty Dome Mosque World Heritage Walk', 'Khan Jahan Ali Dighi & Tomb', 'Mongla Port Bay'],
      },
      {
        name: 'Satkhira',
        division: 'Khulna',
        coords: { lat: 22.7185, lng: 89.0705 },
        popularAreas: ['Shyamnagar Mangrove Sanctuary', 'Mandarbari Sea Beach', 'Mozaffar Garden'],
      },
      {
        name: 'Jashore',
        division: 'Khulna',
        coords: { lat: 23.1664, lng: 89.2081 },
        popularAreas: ['Michael Madhusudan Dutt Memorial (Sagardari)', 'Jessore Collectorate Park', 'Benapole Gateway'],
      },
      {
        name: 'Kushtia',
        division: 'Khulna',
        coords: { lat: 23.9013, lng: 89.1205 },
        popularAreas: ['Lalon Shah Mazar Baul Courtyard', 'Rabindranath Tagore Shilaidaha Kuthibari', 'Gorai Riverfront'],
      },
      {
        name: 'Jhenaidah',
        division: 'Khulna',
        coords: { lat: 23.5448, lng: 89.1539 },
        popularAreas: ['Miyar Dalan', 'Naldanga Royal Palace', 'Johurpur Lake'],
      },
      {
        name: 'Chuadanga',
        division: 'Khulna',
        coords: { lat: 23.6402, lng: 88.8418 },
        popularAreas: ['Carew & Co Distillery Heritage Grounds', 'Mathabhanga River Pier', 'Gholdari Mosque'],
      },
      {
        name: 'Meherpur',
        division: 'Khulna',
        coords: { lat: 23.7749, lng: 88.6318 },
        popularAreas: ['Mujibnagar Memorial Complex', 'Bhatpara Blue Factory Heritage', 'Amjhupi Nilkuthi'],
      },
      {
        name: 'Narail',
        division: 'Khulna',
        coords: { lat: 23.1725, lng: 89.5127 },
        popularAreas: ['SM Sultan Bengal Art Gallery & Boat Studio', 'Chitra Riverfront', 'Victoria College Field'],
      },
      {
        name: 'Magura',
        division: 'Khulna',
        coords: { lat: 23.4873, lng: 89.4199 },
        popularAreas: ['Nabaganga River Edge', 'Sreepur Jamidar Palace', 'Raja Sitaram Ray Palace'],
      },
    ],
  },
  {
    name: 'Barishal',
    capital: 'Barishal City',
    coords: { lat: 22.7010, lng: 90.3535 },
    districts: [
      {
        name: 'Barishal',
        division: 'Barishal',
        coords: { lat: 22.7010, lng: 90.3535 },
        popularAreas: [
          'Floating Guava Canal Kayak Pier',
          'Bellik’s Park & Kirtankhola Riverside',
          'Durga Sagar Dighi Island',
          'Oxford Mission Epiphany Church',
        ],
      },
      {
        name: 'Patuakhali',
        division: 'Barishal',
        coords: { lat: 22.3596, lng: 90.3299 },
        popularAreas: ['Kuakata Daughter of Sea Sunset/Sunrise Beach', 'Jhaubon Pine Groves', 'Fatrar Char Mangrove'],
      },
      {
        name: 'Bhola',
        division: 'Barishal',
        coords: { lat: 22.6859, lng: 90.6482 },
        popularAreas: ['Char Kukri Mukri Wildlife Island', 'Tulabulia River Deck', 'Monpura Island Sunset Strip'],
      },
      {
        name: 'Pirojpur',
        division: 'Barishal',
        coords: { lat: 22.5841, lng: 89.9720 },
        popularAreas: ['Swarupkathi Floating Timber Market', 'Hularhat Launch Pier', 'Rayerkati Zamindar Bari'],
      },
      {
        name: 'Barguna',
        division: 'Barishal',
        coords: { lat: 22.0953, lng: 90.1121 },
        popularAreas: ['Shuvo Sandhya Sea Beach', 'Bishkhali River Estuary', 'Harinbaria Eco Camp'],
      },
      {
        name: 'Jhalokathi',
        division: 'Barishal',
        coords: { lat: 22.6406, lng: 90.1987 },
        popularAreas: ['Bhimruli Floating Market Hub', 'Sugandha River Steps', 'Gabkhan Channel Bridge'],
      },
    ],
  },
  {
    name: 'Rangpur',
    capital: 'Rangpur City',
    coords: { lat: 25.7439, lng: 89.2752 },
    districts: [
      {
        name: 'Rangpur',
        division: 'Rangpur',
        coords: { lat: 25.7439, lng: 89.2752 },
        popularAreas: [
          'Tajhat Palace Gardens & Tea Stall Circle',
          'Chikli Waterfront Waterpark',
          'Town Hall Cultural Plaza',
          'Carmichael College Heritage Courtyards',
        ],
      },
      {
        name: 'Dinajpur',
        division: 'Rangpur',
        coords: { lat: 25.6217, lng: 88.6355 },
        popularAreas: ['Kantajew Terracotta Temple', 'Ramsagar National Lake Park', 'Shopnopuri Park & Camp'],
      },
      {
        name: 'Panchagarh',
        division: 'Rangpur',
        coords: { lat: 26.3411, lng: 88.5542 },
        popularAreas: ['Tetulia Kanchenjunga View Deck', 'Dahuk Tea Estate Trails', 'Banglabandha Zero Point'],
      },
      {
        name: 'Kurigram',
        division: 'Rangpur',
        coords: { lat: 25.8054, lng: 89.6362 },
        popularAreas: ['Dharla River Bridge Strip', 'Chilmari River Port', 'Bhurungamari Green Borderland'],
      },
      {
        name: 'Gaibandha',
        division: 'Rangpur',
        coords: { lat: 25.3288, lng: 89.5430 },
        popularAreas: ['Balashighat Jamuna River Beach', 'Bardhankuthi Rajbari', 'Teesta Barrage'],
      },
      {
        name: 'Nilphamari',
        division: 'Rangpur',
        coords: { lat: 25.9318, lng: 88.8496 },
        popularAreas: ['Nilsagar Historic Lake', 'Saidpur Railway Workshop Heritage', 'Teesta Barrage Canal'],
      },
      {
        name: 'Thakurgaon',
        division: 'Rangpur',
        coords: { lat: 26.0337, lng: 88.4617 },
        popularAreas: ['Surunatha Temple & Forest', 'Tangon River Promenade', 'Baliadangi Ancient Banyan Tree'],
      },
      {
        name: 'Lalmonirhat',
        division: 'Rangpur',
        coords: { lat: 25.9923, lng: 89.2847 },
        popularAreas: ['Teesta Barrage Sunset Deck', 'Dharla Riverside Char', 'Tin Bigha Corridor Walk'],
      },
    ],
  },
  {
    name: 'Mymensingh',
    capital: 'Mymensingh City',
    coords: { lat: 24.7471, lng: 90.4203 },
    districts: [
      {
        name: 'Mymensingh',
        division: 'Mymensingh',
        coords: { lat: 24.7471, lng: 90.4203 },
        popularAreas: [
          'Brahmaputra Riverside Grassbank',
          'Shashi Lodge Royal Gardens',
          'Bangladesh Agricultural University Botanical Trail',
          'Zainul Abedin Sangrahashala Deck',
        ],
      },
      {
        name: 'Netrokona',
        division: 'Mymensingh',
        coords: { lat: 24.8709, lng: 90.7279 },
        popularAreas: ['Birishiri White Clay Hills & Turquoise Lake', 'Sompod Dighi', 'Kangsa River Bank'],
      },
      {
        name: 'Jamalpur',
        division: 'Mymensingh',
        coords: { lat: 24.9375, lng: 89.9378 },
        popularAreas: ['Gandhi Ashram Park', 'Brahmaputra Char Crossing', 'Lakkhipur Greenery'],
      },
      {
        name: 'Sherpur',
        division: 'Mymensingh',
        coords: { lat: 25.0205, lng: 90.0153 },
        popularAreas: ['Garo Hills Forest Edge', 'Gojni Holiday Resort Green', 'Madhutila Eco Park'],
      },
    ],
  },
];

export const ALL_DISTRICTS: DistrictInfo[] = BANGLADESH_DIVISIONS.flatMap((d) => d.districts);

/**
 * Searches across Bangladesh hierarchy (division, district, upazila/city, area)
 */
export function searchBangladeshLocations(query: string): {
  division: DivisionName;
  district: string;
  area: string;
  coords: Coordinates;
  displayName: string;
}[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const results: {
    division: DivisionName;
    district: string;
    area: string;
    coords: Coordinates;
    displayName: string;
  }[] = [];

  for (const div of BANGLADESH_DIVISIONS) {
    for (const dist of div.districts) {
      if (dist.name.toLowerCase().includes(q)) {
        results.push({
          division: div.name,
          district: dist.name,
          area: dist.popularAreas[0] || dist.name,
          coords: dist.coords,
          displayName: `${dist.name}, ${div.name}`,
        });
      }
      for (const area of dist.popularAreas) {
        if (area.toLowerCase().includes(q)) {
          results.push({
            division: div.name,
            district: dist.name,
            area: area,
            coords: dist.coords,
            displayName: `${area} (${dist.name}, ${div.name})`,
          });
        }
      }
    }
  }

  return results.slice(0, 12);
}
