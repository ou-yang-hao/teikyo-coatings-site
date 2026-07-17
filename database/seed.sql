-- 首次启动时写入的 TeiKyo 官网内容。数据库已有 settings 数据后不会重复执行。

BEGIN;

INSERT INTO settings (key, value) VALUES
  ('about_body', 'TeiKyo is a modern high-tech enterprise integrating the research, production, sales and service of high-end environmental coatings and industrial new materials. Our work covers automotive, electronics, waterborne systems and industrial corrosion protection.'),
  ('about_emphasis', 'research and service.'),
  ('about_hero_emphasis', 'Driven by innovation.'),
  ('about_hero_eyebrow', 'About TeiKyo'),
  ('about_hero_intro', 'An integrated coatings enterprise serving customers through development, manufacturing, testing and technical support.'),
  ('about_hero_primary', 'Rooted in coatings.'),
  ('about_primary', 'High-performance coatings developed through'),
  ('address', 'Baishu Industrial Park, Guiyang County, Chenzhou City, Hunan Province, China
Fax: 0086-0735-4521999 · Postal code: 424400'),
  ('company_legal_name', 'Hunan Dijing Chemical New Material Co., Ltd.'),
  ('company_name', 'TeiKyo'),
  ('company_tagline', 'High-performance coatings and industrial new materials since 2000.'),
  ('contact_email', 'info@teikyo.cn'),
  ('contact_phone_display', '0086-0735-4521666'),
  ('contact_phone_link', '+867354521666'),
  ('hero_emphasis', 'Built for industry.'),
  ('hero_intro', 'TeiKyo integrates research, production, sales and technical service for automotive, electronic, waterborne and industrial anticorrosive coatings.'),
  ('hero_primary', 'Coating innovation.'),
  ('solutions_hero_emphasis', 'real applications.'),
  ('solutions_hero_eyebrow', 'Four application industries'),
  ('solutions_hero_intro', 'TeiKyo supports automotive, electronic, water-based and industrial anticorrosive coating applications.'),
  ('solutions_hero_primary', 'Coating systems for'),
  ('solutions_intro_body', 'Our teams connect coating selection, application trials, performance testing and quality support for each customer program.'),
  ('solutions_intro_emphasis', 'production support.'),
  ('solutions_intro_eyebrow', 'Industry solutions'),
  ('solutions_intro_primary', 'From material selection to');

INSERT INTO stats (value, label, position) VALUES
  ('2000', 'Founded', 1),
  ('8', 'Subsidiaries', 2),
  ('17', 'Patents', 3);

INSERT INTO products (category, category_label, code, title, summary, theme, image_url, description, features, applications, substrates, performance, process, package_info, document_url, position, is_published) VALUES
  ('automotive', 'Automotive Coatings', 'TK-A01', 'Automobile interior coating', 'Decorative and protective coating solutions for automotive interior components.', 'red', '/assets/legacy/automobile-interior.jpg', 'A TeiKyo automotive coating platform for interior components. Final coating selection is confirmed against the customer''s substrate, appearance target and production process.', 'Application-specific development|Color and appearance matching|Technical validation support', 'Automotive interior trim|Decorative interior components', 'Confirmed during technical review', 'Appearance|Adhesion|Durability', 'Confirmed for the customer''s production line', 'Contact TeiKyo for specifications and available pack sizes.', '', 1, 1),
  ('automotive', 'Automotive Coatings', 'TK-A02', 'Automobile lamp coating', 'Coating solutions developed for automotive lamp components and their production requirements.', 'red', '/assets/legacy/automobile-lamp.jpg', 'A coating platform for automotive lamp applications. TeiKyo confirms the coating structure and curing route after reviewing the component, substrate and required optical appearance.', 'Application-specific development|Coating-system matching|Technical validation support', 'Automotive lamps|Lamp decorative components', 'Confirmed during technical review', 'Appearance|Adhesion|Process compatibility', 'Confirmed for the customer''s production line', 'Contact TeiKyo for specifications and available pack sizes.', '', 2, 1),
  ('automotive', 'Automotive Coatings', 'TK-A03', 'Paint for automobile exterior parts', 'Finishes for bumpers, pillars, rear skirts, mirror covers, handles, wheel covers, racks and spoilers.', 'red', '/assets/legacy/automobile-exterior-parts.jpg', 'Decorative and protective coatings for common automobile exterior components, developed around the part geometry, substrate, color target and line conditions.', 'Exterior appearance|Application matching|Component-specific development', 'Bumpers|Side pillars|Rear skirts|Mirror covers|Door handles|Wheel covers|Roof racks|Spoilers', 'Engineering plastics|Prepared automotive substrates', 'Appearance|Adhesion|Weathering focus', 'Spray and cure conditions confirmed by project', 'Contact TeiKyo for specifications and available pack sizes.', '', 3, 1),
  ('automotive', 'Automotive Coatings', 'TK-A04', 'Automobile body coating', 'High-temperature body coatings and matching development for automated electrostatic spray lines.', 'red', '/assets/legacy/automobile-body.jpg', 'TeiKyo develops high-temperature automobile body coating systems and supporting solutions for automated electrostatic spray production lines.', 'High-temperature system|Electrostatic-line compatibility|Matching development', 'Automobile bodies|Automated coating lines', 'Prepared automotive body substrates', 'Film appearance|Process stability|Coating compatibility', 'Automated electrostatic spraying and specified bake cycle', 'Contact TeiKyo for specifications and available pack sizes.', '', 4, 1),
  ('electronics', 'Electronic Coatings', 'TK-E01', 'PVD coatings', 'UV primer, intermediate and topcoat systems for physical vapor deposition applications.', 'blue', '/assets/legacy/pvd-coatings.jpg', 'PVD-compatible UV coatings support primer, intermediate and topcoat layers used with vacuum physical vapor deposition to create metallic gloss and mirror effects.', 'PVD-compatible layers|Metallic and mirror effects|UV coating system', 'Mobile devices|Electronic housings|Decorative components', 'Project-specific plastics and prepared surfaces', 'Appearance|Adhesion|Layer compatibility', 'PVD and UV process confirmed during project evaluation', 'Contact TeiKyo for specifications and available pack sizes.', '', 5, 1),
  ('electronics', 'Electronic Coatings', 'TK-E02', 'Metallic coatings', 'Decorative coatings for alloy parts used in electronics, appliances and industrial components.', 'blue', '/assets/legacy/metallic-coatings.jpg', 'Metallic coating systems for magnesium, aluminum, zinc and titanium alloys used in phones, notebooks, e-readers, cameras, appliances and industrial parts.', 'Alloy-substrate compatibility|Metallic appearance|Decorative protection', 'Phones|Notebook computers|E-readers|Digital cameras|Appliances|Industrial parts', 'Magnesium alloy|Aluminum alloy|Zinc alloy|Titanium alloy', 'Adhesion|Hardness|Impact resistance|Weather resistance|Color and gloss retention', 'Surface preparation and application route confirmed by substrate', 'Contact TeiKyo for specifications and available pack sizes.', '', 6, 1),
  ('electronics', 'Electronic Coatings', 'TK-E03', 'Elastic (PU, UV) coating', 'Soft-touch elastic finishes with resistance to chemicals, stains, water, humidity and scratching.', 'mint', '/assets/legacy/elastic-pu-uv.jpg', 'Elastic PU and UV coating systems are designed for a fine tactile finish together with elastic deformation and protection in frequently handled applications.', 'Fine tactile feel|Elastic response|PU and UV options', 'Consumer electronics|Control surfaces|High-touch components', 'Confirmed during technical review', 'Chemical resistance|Stain resistance|Water and humidity resistance|Scratch resistance', 'PU or UV route selected against the production requirement', 'Contact TeiKyo for specifications and available pack sizes.', '', 7, 1),
  ('electronics', 'Electronic Coatings', 'TK-E04', 'LDS antenna coating', 'Coating systems for LDS antenna structures used in mobile, wireless-audio and automotive electronics.', 'gold', '/assets/legacy/lds-antenna.jpg', 'LDS antenna coatings support selected reinforced plastics, plated polymer structures and magnesium alloy components in connected electronic applications.', 'LDS application support|Multiple substrate options|Electronics-focused development', 'Mobile phones|Wireless speakers|Automotive electronics', 'PC+GF|PA+GF|PC with gold nickel or copper plating|Magnesium alloy', 'Adhesion|Appearance|Process compatibility', 'LDS-compatible coating process confirmed during technical review', 'Contact TeiKyo for specifications and available pack sizes.', '', 8, 1);

INSERT INTO solutions (title, summary, position, is_published) VALUES
  ('Automotive Coatings Industry', 'Coating systems for vehicle interiors, lamps, exterior trim, bumpers and body applications, supported by application testing and technical service.', 1, 1),
  ('Electronic Coating Industry', 'Decorative and protective finishes for mobile devices, computers, household appliances and electronic components, including PVD, metallic, elastic and LDS systems.', 2, 1),
  ('Water Based Coating Industry', 'Waterborne coating technology using water as the primary diluent, developed for application performance, appearance and environmental objectives.', 3, 1),
  ('Industrial Anticorrosive Coating Industry', 'Protective coating solutions for machinery, power and petrochemical equipment, bridges, ships, containers and other demanding industrial assets.', 4, 1);

INSERT INTO insights (type, title, summary, published_at, read_time, is_featured, is_published) VALUES
  ('Company History', 'TeiKyo''s official company website was launched', 'A milestone in the company''s development and international communication.', '2020-02-11', '', 1, 1);

COMMIT;

