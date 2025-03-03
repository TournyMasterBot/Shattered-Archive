import IAbility from "@shared/types/ability-types/ability";
import Berserk from "@shared/types/ability-types/skills/Berserk";
import Sharpen from "@shared/types/ability-types/skills/Sharpen";
import Toughness from "@shared/types/ability-types/skills/Toughness";
import Infravision from "@shared/types/ability-types/spells/Infravision";
import { IStatAttribute, StatAttribute, StatAttributeType } from "@shared/types/character-types/stat-attribute";
import BoostedClass from "@shared/types/character-types/boostedClass";
import IDamageType from "@shared/types/damage-types/damage-type-interface";
import IDslClass from "@shared/types/character-types/dslClass";
import { IRace } from "@shared/types/character-types/race-interface";
import ServerCache from "@shared/cache/server-cache";

class HillDwarf implements IRace {
  private static instance: HillDwarf;

  public id: string;
  public imageUrl: string;
  public description?: string | undefined;
  public cpModifier?: number | undefined;
  public name: string;
  public displayName: string;
  public isLimitedRace: boolean;
  public isMortalRace: boolean;
  public isLargeRace: boolean;
  public stats: IStatAttribute[];
  public primaryAttributeModifier: IStatAttribute;
  public secondaryAttributeModifier: IStatAttribute;
  public immunities: IDamageType[];
  public resistances: IDamageType[];
  public vulnerabilities: IDamageType[];
  public racialAbilities: IAbility[];
  public availableClasses: IDslClass[];
  public restrictedClasses: IDslClass[];
  public boostedClasses: Map<IDslClass, BoostedClass[]>;

  constructor() {
    this.id = "18";
    this.name = this.constructor.name;
    this.displayName = "Hill Dwarf";
    this.isLimitedRace = false;
    this.isMortalRace = true;
    this.isLargeRace = false;
    this.cpModifier = 8;
    this.stats = [
      new StatAttribute({
        type: StatAttributeType.Strength,
        modifier: 62,
      }),
      new StatAttribute({
        type: StatAttributeType.Intelligence,
        modifier: 52,
      }),
      new StatAttribute({
        type: StatAttributeType.Wisdom,
        modifier: 79,
      }),
      new StatAttribute({
        type: StatAttributeType.Dexterity,
        modifier: 50,
      }),
      new StatAttribute({
        type: StatAttributeType.Constitution,
        modifier: 64,
      }),
    ];
    this.primaryAttributeModifier = new StatAttribute({
      type: StatAttributeType.Variable,
      modifier: 8,
    });
    this.secondaryAttributeModifier = new StatAttribute({
      type: StatAttributeType.Variable,
      modifier: 4,
    });
    this.immunities = [];
    this.resistances = [];
    this.vulnerabilities = [];
    this.racialAbilities = [Sharpen.GetInstance().Get(), Berserk.GetInstance().Get(), Toughness.GetInstance().Get(), Infravision.GetInstance().Get()];
    this.availableClasses = [
      /*
            new Warrior(),
            new Barbarian(),
            new Ranger(),
            new Armsman(),
            new Samurai(),
            new Thief(),
            new Assassin(),
            new Bandit(),
            new Pirate(),
            new Ninja(),
            new Cleric(),
            new Crusader(),
            new Druid(),
            new Shaman(),
            new Priest(),
            new Shukenja(),
            new Bard(),
            new Jongleur(),
            new Charlatan(),
            new Skald(),
            new Brewmaster(),
            new Monk(),
            new Dragonslayer(),
            new Battlerager(),
            new Runesmith()
            */
    ];
    this.restrictedClasses = [
      /*var missingClasses = DslClassHelper.GetAvailableClasses().Where(x => !this.AvailableClasses.Any(y => y.Name == x.Name)).ToArray();
                return missingClasses.ToArray();*/
    ];
    this.boostedClasses = this.boostedClasses = new Map<IDslClass, BoostedClass[]>() /*
            new IClassBoost(new Warrior(), 10, null, null),
            new IClassBoost(new Barbarian(), 10, null, null),
            new IClassBoost(new Ranger(), 10, null, null),
            new IClassBoost(new Armsman(), 30, null, null),
            new IClassBoost(new Samurai(), 20, null, null),
            new IClassBoost(new Thief(), -10, null, null),
            new IClassBoost(new Assassin(), -10, null, null),
            new IClassBoost(new Bandit(), 10, null, null),
            new IClassBoost(new Ninja(), -10, null, null),
            new IClassBoost(new Cleric(), 10, null, null),
            new IClassBoost(new Druid(), 10, null, null),
            new IClassBoost(new Shaman(), 10, null, null),
            new IClassBoost(new Priest(), 10, null, null),
            new IClassBoost(new Shukenja(), 10, null, null),
            new IClassBoost(new Jongleur(), -10, null, null),
            new IClassBoost(new Skald(), 30, null, null),
            new IClassBoost(new Brewmaster(), 20, null, null),
        */;
    this.imageUrl = `https://shatteredarchive.com/img/races/HillDwarf.png`;
    this.description = `Dwarves are short, stocky demi-humans, known for foul temper and great
stamina.  Dwarves have high strength and constitution, but poor dexterity. 
They are not as smart as humans, but are usually wiser due to their long
lifespans.  Dwarves make excellent fighters and priests, but are very poor
mages or thieves.  

Dwarves are very resistant to poison and disease, but cannot swim, and so
are very vulnerable to drowning.  They receive the berserk skill for free
(if warriors), and can see in the dark with infravision.  

Hill-dwarves reside in the hills of course, and are bit more nimble than
mountain-dwarves.  Mountain-dwarves make their homes in large mountains. 
They are a bit stronger than the hill-dwarves.`;
  }

  // Method to get the single instance of the class
  public static GetInstance(): HillDwarf {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Races[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return HillDwarf.GetInstance() as T;
  }
}

export default HillDwarf;
