import type { CompiledContent } from '@cx/content';

/**
 * The Civilopedia's "How to play" articles: short explanations of each system, written for
 * someone who knows Civ, with the numbers read from the rules where they live there.
 */
export interface Concept {
  id: string;
  title: string;
  paragraphs: (content: CompiledContent) => string[];
}

export const CONCEPTS: Concept[] = [
  {
    id: 'turn',
    title: 'A turn',
    paragraphs: () => [
      'Everyone moves at the same time. The button at the bottom always does the next thing that needs you: a unit to move, a research to choose, a tile to develop, and finally End turn (Enter does the same).',
      'When every player has ended their turn, the world moves on: settlements grow and build, research and civics advance, religions spread, and the AI leaders, city-states and camps act.',
    ],
  },
  {
    id: 'settlements',
    title: 'Towns and cities',
    paragraphs: (c) => [
      'Your capital is a city. Every later settlement starts as a town: towns have no build queue and turn their production into gold, which keeps a wide empire quick to play.',
      `At ${c.rules.settlements.specialization.minPopulation} citizens a town picks a specialization (farming, mining, trade, fort, religious or resort), or you can pay gold to make it a city with its own build queue and districts.`,
      `Settlements must be more than ${c.rules.settlements.minDistance} tiles apart. A settler costs a citizen.`,
    ],
  },
  {
    id: 'growth',
    title: 'Growth develops your land',
    paragraphs: () => [
      'There are no builders. Each time a settlement grows, you choose a tile to develop: a farm, a mine, a pasture, fishing boats... and the new citizen works it at once. An unclaimed tile touching your land can be developed too, which claims it.',
      'Woods, rainforest and marsh can be cleared by a city project for a burst of production or food. Each citizen eats 2 food; a settlement that runs out of food loses a citizen.',
    ],
  },
  {
    id: 'happiness',
    title: 'Happiness',
    paragraphs: () => [
      'Each settlement has a happiness balance instead of housing and amenities. Luxuries, the Palace, entertainment, some buildings, wonders and policies add to it; every two citizens, every building with maintenance and every settlement over your settlement limit take from it.',
      'Five or more makes a settlement thrive (+10% yields and growth); below zero it slows and loses yields, and at -5 it stops growing. Your empire-wide surplus builds up to celebrations: for 10 turns, a bonus wildcard policy slot and +10% production everywhere.',
    ],
  },
  {
    id: 'districts',
    title: 'Districts and adjacency',
    paragraphs: () => [
      'Cities build districts on their own tiles: a Campus for science, a Holy Site for faith, a Theater Square for culture, a Commercial Hub, a Harbor, an Industrial Zone, an Encampment, an Entertainment Complex, an Aqueduct and more. Most buildings go in a district.',
      'Districts get adjacency bonuses from what is next to them (mountains for a Campus, woods for a Holy Site, rivers for a Commercial Hub, and every other district), so planning where they go pays off. Their cost rises with every tech and civic you finish.',
    ],
  },
  {
    id: 'progress',
    title: 'Technologies, civics and boosts',
    paragraphs: (c) => [
      'Science researches technologies; culture works through civics. Both trees have boosts: doing what a node asks (building a quarry, meeting a city-state...) pays part of its cost at once.',
      `A boost pays ${c.rules.progress.boostPercent}% of the cost. Finishing a civic opens a free window to change policy cards; otherwise changing cards costs gold.`,
    ],
  },
  {
    id: 'governments',
    title: 'Governments and policies',
    paragraphs: () => [
      'A government gives a set of policy slots (military, economic, diplomatic and wildcard) and a bonus of its own. Policy cards go into those slots; a wildcard slot takes any card.',
      'New governments come with civics. Changing government outside the free window after a civic costs gold.',
    ],
  },
  {
    id: 'combat',
    title: 'Combat',
    paragraphs: (c) => [
      `Units have a strength. Damage depends on the difference: two equal units deal about ${c.rules.combat.baseDamage} damage to each other, and every point of difference makes it bigger or smaller. Flanking, support, terrain, fortifying, walls and promotions all change the numbers, and the combat preview shows them before you attack.`,
      'Ranged units attack from a distance without taking damage back. Settlements have their own strength and walls, and strike back at units next to them. Units gain experience and promotions; promoting heals the unit but ends its turn.',
    ],
  },
  {
    id: 'commanders',
    title: 'Commanders',
    paragraphs: () => [
      'An army commander gives units around it more strength and lets them gain experience faster. It can pack soldiers next to it inside it, carry them across the map as one unit, and unpack them where the fight is.',
      'Commanders earn their own promotions: more strength when attacking or defending, healing, a wider radius, more room.',
    ],
  },
  {
    id: 'diplomacy',
    title: 'Diplomacy and influence',
    paragraphs: () => [
      'Influence is a yield. It pays for envoys to city-states, for befriending camps and for some treaties. Leaders have agendas and remember what you do: wars, surprise attacks, deals kept and broken, nukes.',
      'Declaring war on a friend or without warning costs you with everyone. Peace can be made after a few turns of war; deals trade gold, resources and more.',
    ],
  },
  {
    id: 'trade',
    title: 'Trade routes',
    paragraphs: (c) => [
      `A trader sent from one of your settlements runs a route for ${c.rules.trade.routeTurns} turns to another settlement up to ${c.rules.trade.range} tiles away (over shallow water too from a settlement with a Harbor). Domestic routes feed the origin; international ones pay gold. Every route builds a road.`,
      'Routes going through a war can be plundered by enemy soldiers standing on their way.',
    ],
  },
  {
    id: 'religion',
    title: 'Religion',
    paragraphs: (c) => [
      `${c.rules.religion.pantheonFaith} faith founds a pantheon. A great prophet in a settlement with a Holy Site founds a religion with a founder, a follower and a worship belief. Each belief can only be taken once in a game.`,
      'Religions spread by pressure from nearby followers, holy cities and trade routes, and by missionaries and apostles. Inquisitors drive other religions out of your settlements. With the theological combat option, religious units can fight rival faiths.',
      'A religious victory comes when your religion is followed in more than half the settlements of every other civ.',
    ],
  },
  {
    id: 'greatPeople',
    title: 'Great people and great works',
    paragraphs: () => [
      'Districts, buildings and wonders earn great person points. The first civ to collect enough for a great person of a kind recruits them (or pays gold or faith to do it sooner). Each one acts once: founding a religion, finishing a district, a burst of science...',
      'Great writers, artists and musicians create great works that fill slots in buildings and wonders and bring culture and tourism; a full building of one kind gets a theming bonus.',
    ],
  },
  {
    id: 'independents',
    title: 'City-states and camps',
    paragraphs: (c) => [
      `City-states give bonuses to the civs that send them envoys, at 1, 3 and 6 envoys. The civ with the most (at least ${c.rules.cityStates.suzerainEnvoys}) is suzerain: it gets the city-state's own bonus and can levy its soldiers for gold.`,
      `Hostile camps send out raiders. Clear one with soldiers for gold, or befriend it with ${c.rules.cityStates.befriendInfluence} influence a turn for ${c.rules.cityStates.befriendTurns} turns: the first civ to finish turns it into a new city-state.`,
      'Tribal villages in the wilds give a gift to the first unit that reaches them.',
    ],
  },
  {
    id: 'ages',
    title: 'Eras and ages',
    paragraphs: () => [
      'Historic moments (the first to found a religion, build a wonder, circle the globe...) earn era score. When the world moves into a new era, your score decides your age: dark, normal, golden, or heroic after a dark one.',
      'Each age lets you pick dedications that give bonuses for the era. A dark age is hard but makes a heroic age easier.',
    ],
  },
  {
    id: 'governors',
    title: 'Governors',
    paragraphs: () => [
      'Civics give governor titles. Use one to appoint a governor or to promote one. A governor posted to a settlement takes a few turns to establish, then gives its bonuses there and helps hold its loyalty.',
    ],
  },
  {
    id: 'loyalty',
    title: 'Loyalty',
    paragraphs: () => [
      'Every settlement feels loyalty pressure from the citizens of nearby settlements: its own civ pushes it up, others push it down. Governors, monuments and some policies help. A settlement whose loyalty runs out breaks away as a free city, which can later join the civ pushing hardest.',
    ],
  },
  {
    id: 'espionage',
    title: 'Espionage',
    paragraphs: () => [
      'Spies come with civics. Post one at home to guard against enemy spies, or send it to a rival settlement to steal a boost, siphon gold, sabotage production or stir up unrest. Every mission shows its chance of success; a caught spy is lost.',
    ],
  },
  {
    id: 'congress',
    title: 'The World Congress',
    paragraphs: () => [
      'Once the world reaches a later era, the World Congress meets every few turns to vote on resolutions. Diplomatic favor buys extra votes. Winning a vote you backed earns diplomatic victory points, and enough of them is a diplomatic victory.',
    ],
  },
  {
    id: 'climate',
    title: 'Climate and disasters',
    paragraphs: () => [
      'Floods, storms, droughts and eruptions strike now and then: they damage improvements for a while, but floods and eruptions leave the land richer. Factories, power plants and similar buildings emit; as world emissions rise, disasters grow more likely and the seas rise over low coastal land.',
    ],
  },
  {
    id: 'war',
    title: 'Pillaging, plundering and nukes',
    paragraphs: () => [
      'At war, a land soldier can pillage an enemy improvement it stands on for gold and health; the improvement is out of use for a while. A soldier on the way of an enemy trade route can plunder it.',
      'With the nuclear weapons option, atomic bombs and nuclear missiles strike a tile in range: units in the blast are lost, settlements lose half their people and their defenses, and the land yields nothing until the fallout clears. Every civ remembers who used one.',
    ],
  },
  {
    id: 'victory',
    title: 'Victory',
    paragraphs: () => [
      'Win by domination (hold every rival capital), science (launch the expedition to another world), culture (more visiting tourists than any civ has domestic ones), religion, or diplomacy in the World Congress. At the turn limit, the highest score wins.',
      'The Victories screen (V) shows how close everyone is to each one.',
    ],
  },
];
