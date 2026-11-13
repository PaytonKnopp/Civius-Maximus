import { type CompiledContent, resolveText } from '@cx/content';

/**
 * The Civilopedia's "How to play" articles: short explanations of each system, written for
 * someone who knows Civ, with the numbers read from the rules where they live there (so a rule
 * that changes, or a mod that changes it, changes the text with it).
 */
export interface Concept {
  id: string;
  title: string;
  paragraphs: (content: CompiledContent) => string[];
}

const turns = (n: number) => `${n} turn${n === 1 ? '' : 's'}`;
/** "A, B and C". */
const list = (names: string[]) =>
  names.length <= 1
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

export const CONCEPTS: Concept[] = [
  {
    id: 'turn',
    title: 'A turn',
    paragraphs: () => [
      'Everyone moves at the same time. The button at the bottom always does the next thing that needs you: a unit to move, a research to choose, a tile to develop, and finally End turn (Enter does the same).',
      'When every player has ended their turn, the world moves on: settlements grow and build, research and civics advance, religions spread, and the AI leaders, city-states and camps act. Which civ is handled first moves on by one seat every turn, so nobody always wins a tie.',
      'Units that are done can sleep, fortify or skip. A soldier or a ship can also Explore (it heads for the nearest edge of the known map every turn until nothing is left to find) or stand on Alert (asleep until an enemy soldier comes into sight). In a game with one human, Ctrl+Z takes back a move that revealed nothing new; F5 quick saves and F9 loads it.',
    ],
  },
  {
    id: 'settlements',
    title: 'Towns and cities',
    paragraphs: (c) => {
      const s = c.rules.settlements;
      return [
        'Your capital is a city. Every later settlement starts as a town: towns have no build queue and turn their production into gold, which keeps a wide empire quick to play.',
        `At ${s.specialization.minPopulation} citizens a town picks a specialization (farming, mining, trade, fort, religious or resort), or you can pay gold to make it a city with its own build queue and districts. A farming or mining town sends part of its food or production to your nearest city within ${s.specialization.sendRange} tiles.`,
        `Settlements must be more than ${s.minDistance} tiles apart. A settler costs a citizen. Past your settlement limit (${s.startingLimit} at first, more with civics), every settlement over it costs each of your settlements ${s.happiness.perSettlementOverLimit} happiness.`,
        `A city's build queue holds several items; Repeat keeps training the same unit or running the same project. A city with nothing to build sells its production for gold instead of wasting it.`,
      ];
    },
  },
  {
    id: 'growth',
    title: 'Growth develops your land',
    paragraphs: (c) => [
      'There are no builders. Each time a settlement grows, you choose a tile to develop: a farm, a mine, a pasture, fishing boats... and the new citizen works it at once. An unclaimed tile touching your land can be developed too, which claims it. A choice left open is made for you when the turn ends.',
      `Woods, rainforest and marsh can be cleared by a city project for a burst of production or food. Each citizen eats ${c.rules.settlements.foodPerCitizen} food; a settlement that runs out of food loses a citizen.`,
      'Improvements get better as you research: later technologies and civics add yields to farms, mines, pastures, camps and the rest.',
    ],
  },
  {
    id: 'happiness',
    title: 'Happiness',
    paragraphs: (c) => {
      const h = c.rules.settlements.happiness;
      const cel = c.rules.progress.celebration;
      return [
        `Each settlement has a happiness balance instead of housing and amenities. It starts at +${h.base}. Luxuries, entertainment, some buildings, wonders and policies add to it; every ${h.citizensPerUnhappy} citizens take 1, every ${h.maintainedPerUnhappy} buildings with upkeep take ${h.perMaintainedBuilding}, and so does every settlement over your settlement limit.`,
        `${h.thrivingAt} or more makes a settlement thrive (+${h.thrivingYieldPercent}% yields and growth); below zero it loses ${-h.unhappyYieldPercentPerPoint}% of its yields a point, and at ${h.unrestAt} it is in unrest: ${h.unrestYieldPercent}% yields and no growth.`,
        `Your empire-wide surplus builds up to celebrations (${cel.base} for the first, ${cel.perCelebration} more for each after): for ${turns(cel.turns)}, a bonus wildcard policy slot and +10% production everywhere.`,
      ];
    },
  },
  {
    id: 'resources',
    title: 'Resources, stockpiles and monopolies',
    paragraphs: (c) => {
      const st = c.rules.strategic;
      const m = c.rules.monopoly;
      return [
        'Bonus resources (wheat, cattle, fish...) add yields to their tile. A resource tile takes only the improvement that suits it.',
        `Luxuries (silk, wine, dyes, salt...) bring happiness once improved: each kind cheers the settlement that owns it and your ${c.rules.luxuryHappinessRadius} nearest others, once per settlement however many copies reach it. Spare copies are for trading in deals.`,
        `Improve more than ${m.sharePercent}% of the tiles of one luxury on the map (at least ${m.minCopies}) and you hold its monopoly: a bonus for your whole empire, named in the luxury's article.`,
        `Strategic resources (horses, iron, niter, coal, oil, aluminum, uranium) stay hidden until their technology. Each improved source adds to a stockpile every turn, up to ${st.stockpileBase}, and ${st.stockpilePerEra} more for each era after the first. Training or upgrading the units that need one spends from it; from the Industrial era on, such units also use some up every turn, and fight at −${st.shortageStrength} strength while you are short. The top bar shows each stockpile and its change.`,
      ];
    },
  },
  {
    id: 'districts',
    title: 'Districts and adjacency',
    paragraphs: (c) => {
      const d = c.rules.settlements.districts;
      return [
        'Cities build districts on their own tiles: a Campus for science, a Holy Site for faith, a Theater Square for culture, a Commercial Hub, a Harbor, an Industrial Zone, an Encampment, an Entertainment Complex, an Aqueduct and more. Most buildings go in a district.',
        `A city can hold ${d.base} specialty district, and one more for every ${d.populationPer} citizens. An Aqueduct, a Neighborhood (growth, and happiness from the appeal of its tile), a Dam (across a river on its floodplains: no more floods on that settlement's land, and production), a Preserve (on woods or rainforest: appeal and yields for the tiles around) and a Spaceport do not count against that.`,
        `Districts get adjacency bonuses from what is next to them (mountains for a Campus, woods for a Holy Site, rivers for a Commercial Hub, and +${d.neighborBonus} from every other district), and each building in a district adds about a third of that bonus again, so a well-placed district pays all game. The district adjacency lens shows the best spot on each free tile.`,
        `A district's cost rises by ${d.costPerProgressPercent}% with every tech and civic you finish. A Factory, a Power Plant and a Stadium also reach your other city centers within 6 tiles. The Government Plaza takes one building of each of its three pairs.`,
      ];
    },
  },
  {
    id: 'appeal',
    title: 'Appeal, parks and resorts',
    paragraphs: (c) => {
      const a = c.rules.appeal;
      return [
        `Every tile has an appeal: mountains, woods, coast, lakes, natural wonders, wonders and districts such as a Holy Site or a Preserve raise it; rainforest, marsh, mines, quarries and industry lower it. ${a.breathtaking} or more is breathtaking, ${a.charming} charming, ${a.uninviting} or less uninviting. The appeal lens shows it.`,
        'Appeal pays in three ways: a Neighborhood is happier on a lovely tile; a national park (on breathtaking land) and a seaside resort (on a breathtaking flat coast) are improvements that bring tourism by their appeal; and a resort town turns the appeal of its land into gold, happiness and tourism.',
      ];
    },
  },
  {
    id: 'progress',
    title: 'Technologies, civics and boosts',
    paragraphs: (c) => {
      const p = c.rules.progress;
      return [
        'Science researches technologies; culture works through civics. Both trees have boosts: doing what a node asks (building a quarry, meeting a city-state...) pays part of its cost at once.',
        `A boost pays ${p.boostPercent}% of the cost. Finishing a civic opens a free window to change policy cards; otherwise changing cards costs gold.`,
        `A technology or civic costs ${p.catchUp.perCiv}% less for every civ you have met that already has it, up to ${p.catchUp.max}%: a civ behind catches up, the leader pays full price. The last nodes of each tree, Future Tech and Future Civic, can be researched again and again for score.`,
      ];
    },
  },
  {
    id: 'governments',
    title: 'Governments, policies and ideologies',
    paragraphs: (c) => {
      const p = c.rules.progress;
      const i = c.rules.ideology;
      return [
        'A government gives a set of policy slots (military, economic, diplomatic and wildcard) and a bonus of its own. Policy cards go into those slots; a wildcard slot takes any card. Some cards go obsolete with a later civic and leave their slot.',
        `New governments come with civics. Changing government outside the free window after a civic costs ${p.governmentChangeCost} gold, a card ${p.policySwapCost}.`,
        `Time in a government leaves a legacy: every ${turns(p.legacy.everyTurns)} in it (at Standard speed) earns its legacy bonus once more, up to ${p.legacy.max} times, and you keep it after you change.`,
        `The late governments belong to three ideologies: ${list(i.camps.map((x) => resolveText(c, x.name)))}. Visitors from civs of another ideology unsettle your people: −1 happiness in every settlement for each ${i.stepPercent}% of your own tourists they add up to (up to −${i.maxUnhappiness}); visitors from your own ideology cheer them instead.`,
      ];
    },
  },
  {
    id: 'combat',
    title: 'Combat',
    paragraphs: (c) => {
      const w = c.rules.combat.warSupport;
      return [
        `Units have a strength. Damage depends on the difference: two equal units deal about ${c.rules.combat.baseDamage} damage to each other, and every point of difference makes it bigger or smaller. Flanking, support, terrain, fortifying, walls and promotions all change the numbers, and the combat preview shows them before you attack.`,
        'Ranged units attack from a distance without taking damage back. Settlements have their own strength and walls, and strike back at units in range. Units gain experience and promotions; promoting heals the unit but ends its turn.',
        "Support units travel with an army: beside a Battering Ram your melee and anti-cavalry soldiers put all their damage into a settlement's walls, beside a Siege Tower their attacks go past the walls, a Medic heals the units around it, and anti-air units guard against aircraft.",
        `A captured settlement can be kept, razed over several turns, liberated to its founder, or kept as a puppet: it runs itself at ${c.rules.settlements.puppet.yieldPercent}% yields and counts half toward your settlement limit, until you annex it for gold.`,
        `War support follows the fighting (+${w.kill} for a kill, +${w.capture} for a settlement taken, and +${w.surprise} for the victim of a surprise war). The side behind loses ${w.unhappinessPerPoint} happiness per point, up to ${w.maxUnhappiness}. Peace can be offered after ${turns(c.rules.combat.minWarTurns)} of war.`,
      ];
    },
  },
  {
    id: 'commanders',
    title: 'Commanders',
    paragraphs: () => [
      'An army commander gives units around it more strength and lets them gain experience faster. It can pack soldiers next to it inside it, carry them across the map as one unit, and unpack them where the fight is. A fleet commander does the same for ships.',
      'Commanders earn their own promotions: more strength when attacking or defending, healing, a wider radius, more room. A commander caught by the enemy falls back to a settlement instead of being lost.',
    ],
  },
  {
    id: 'diplomacy',
    title: 'Diplomacy, deals and influence',
    paragraphs: (c) => {
      const d = c.rules.diplomacy;
      return [
        `Influence is a yield (every civ makes ${d.baseInfluence} a turn to start with). It pays for envoys to city-states, for befriending camps, for denouncing and for pacts. Leaders have agendas and remember what you do: wars, surprise attacks, deals kept and broken, nukes.`,
        `A war without denouncing the target in the ${turns(d.denounceWarning)} before is a surprise war: every leader remembers it. Deals trade gold (at once or every turn), maps, spare luxuries and strategic resources a turn, and pacts.`,
        `Pacts cost each side influence: a friendship (${d.friendshipCost}, ${turns(d.friendshipTurns)}: no war between you), an alliance (${d.allianceCost}, friends only: you share vision), open borders (${d.openBordersCost}, ${turns(d.openBordersTurns)}: +${c.rules.culture.openBordersPercent}% tourism toward each other, and your units heal in each other's land as at home) and a research agreement (${d.researchCost}, friends only, ${turns(d.researchTurns)}: +${d.researchPercent}% science for both and a boost each when it ends). War ends them all.`,
      ];
    },
  },
  {
    id: 'trade',
    title: 'Trade routes',
    paragraphs: (c) => [
      `A trader sent from one of your settlements runs a route for ${c.rules.trade.routeTurns} turns to another settlement up to ${c.rules.trade.range} tiles away (over shallow water too from a settlement with a Harbor). Domestic routes feed the origin; international ones pay gold, more for every district at the destination and every era. Every route builds a road.`,
      'Routes going through a war can be plundered by enemy soldiers standing on their way. The trade lens draws every route you know of.',
    ],
  },
  {
    id: 'religion',
    title: 'Religion',
    paragraphs: (c) => [
      `${c.rules.religion.pantheonFaith} faith founds a pantheon. A great prophet in a settlement with a Holy Site founds a religion with a founder, a follower and a worship belief. Each belief can only be taken once in a game.`,
      'Religions spread by pressure from nearby followers, holy cities and trade routes, and by missionaries and apostles. Inquisitors drive other religions out of your settlements. With the theological combat option, religious units can fight rival faiths.',
      'Faith also recruits great people, and the founder of a religion can buy buildings with it in settlements that follow the religion.',
      'A religious victory comes when your religion is followed in more than half the settlements of every other civ.',
    ],
  },
  {
    id: 'greatPeople',
    title: 'Great people and great works',
    paragraphs: (c) => [
      'Districts, buildings and wonders earn great person points. The first civ to collect enough for a great person of a kind recruits them (or pays gold or faith to do it sooner). Each one acts once: founding a religion, finishing a district, a burst of science...',
      `Great writers, artists and musicians create great works that fill slots in buildings and wonders and bring culture and tourism; a building whose slots are all filled by different people is themed (+${c.rules.greatWorks.themingPercent}%). Works and wonders draw more tourism as they age: +${c.rules.culture.agingPercent}% for each era past their own, up to +${c.rules.culture.agingMaxPercent}%.`,
    ],
  },
  {
    id: 'independents',
    title: 'City-states and camps',
    paragraphs: (c) => [
      `City-states give bonuses to the civs that send them envoys, at 1, 3 and 6 envoys. The civ with the most (at least ${c.rules.cityStates.suzerainEnvoys}) is suzerain: it gets the city-state's own bonus and can levy its soldiers for gold for ${turns(c.rules.cityStates.levyTurns)}, after which they go home.`,
      `Hostile camps send out raiders. Clear one with soldiers for gold, or befriend it with ${c.rules.cityStates.befriendInfluence} influence a turn for ${c.rules.cityStates.befriendTurns} turns: the first civ to finish turns it into a new city-state (if a city-state could stand there: not inside anyone's borders, not right beside a settlement).`,
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
    paragraphs: (c) => [
      `Civics give governor titles. Use one to appoint a governor or to promote one. A governor posted to a settlement takes ${turns(c.rules.governors.establishTurns)} to establish, then gives its bonuses there and helps hold its loyalty. A governor whose settlement is lost comes home.`,
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
    paragraphs: (c) => {
      const g = c.rules.congress;
      const era = c.entities.era[g.foundingEra];
      return [
        `The World Congress forms when the first civ reaches the ${era ? resolveText(c, era.name) : 'Medieval'} era, and meets every ${turns(g.sessionEvery)} to vote on ${g.resolutionsPerSession} resolutions. One vote is free; diplomatic favor buys more. Putting the most votes behind a resolution that passes earns a diplomatic victory point, being named World Leader two, some wonders more; ${g.victoryPoints} points are a diplomatic victory.`,
        `When a civ is ${g.containment.atPercent}% of the way to any victory, the Congress meets at once to vote on containing it: if it passes, that civ's progress toward that victory is slowed for ${turns(g.containment.turns)}.`,
      ];
    },
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
    paragraphs: (c) => [
      `At war, a land soldier can pillage an enemy improvement it stands on for gold and health; the improvement is out of use for ${turns(c.rules.combat.pillage.turns)}. A soldier on the way of an enemy trade route can plunder it.`,
      `With the nuclear weapons option, atomic bombs and nuclear missiles strike a tile in range: units in the blast are lost, settlements lose half their people and their defenses, and the land yields nothing for ${turns(c.rules.nukes.falloutTurns)}. Every civ remembers who used one.`,
    ],
  },
  {
    id: 'victory',
    title: 'Victory',
    paragraphs: (c) => {
      const era = c.rules.culture.victoryEra
        ? c.entities.era[c.rules.culture.victoryEra]
        : undefined;
      return [
        `Win by domination (hold every rival's original capital), science (build a Spaceport and finish the ${c.rules.science.projects.length} space projects in order; the last arrives ${turns(c.rules.science.travelTurns)} later), culture (draw more visitors from every other civ than it has tourists of its own${era ? `, from the ${resolveText(c, era.name)} era on` : ''}), religion, or diplomacy in the World Congress. At the turn limit, the highest score wins.`,
        'The Victories screen (V) shows how close everyone is to each one. After a win you can play on.',
      ];
    },
  },
];
