import IAbility from "@shared/types/ability-types/ability";
import Bash from "@shared/types/ability-types/skills/Bash";
import FastHealing from "@shared/types/ability-types/skills/FastHealing";
import { IStatAttribute, StatAttribute, StatAttributeType } from "@shared/types/character-types/stat-attribute";
import BluntDamageTypes from "@shared/types/damage-types/damage-type-group-models/groups-blunt";
import MentalDamageTypes from "@shared/types/damage-types/damage-type-group-models/groups-mental";
import BoostedClass from "@shared/types/character-types/boostedClass";
import IDamageType from "@shared/types/damage-types/damage-type-interface";
import IDslClass from "@shared/types/character-types/dslClass";
import { IRace } from "@shared/types/character-types/race-interface";
import ServerCache from "@shared/cache/server-cache";

class GiantOgre implements IRace {
  private static instance: GiantOgre;

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
    this.id = "17";
    this.name = this.constructor.name;
    this.displayName = "Giant Ogre";
    this.isLimitedRace = false;
    this.isMortalRace = true;
    this.isLargeRace = true;
    this.cpModifier = 8;
    this.stats = [
      new StatAttribute({
        type: StatAttributeType.Strength,
        modifier: 92,
      }),
      new StatAttribute({
        type: StatAttributeType.Intelligence,
        modifier: 30,
      }),
      new StatAttribute({
        type: StatAttributeType.Wisdom,
        modifier: 40,
      }),
      new StatAttribute({
        type: StatAttributeType.Dexterity,
        modifier: 35,
      }),
      new StatAttribute({
        type: StatAttributeType.Constitution,
        modifier: 92,
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
    this.resistances = [...BluntDamageTypes.getAll()];
    this.vulnerabilities = [...MentalDamageTypes.getAll()];
    this.racialAbilities = [FastHealing.GetInstance().Get(), Bash.GetInstance().Get()];
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
            new Dragonslayer(),
            */
    ];
    this.restrictedClasses = [
      /*var missingClasses = DslClassHelper.GetAvailableClasses().Where(x => !this.AvailableClasses.Any(y => y.Name == x.Name)).ToArray();
                return missingClasses.ToArray();*/
    ];
    this.boostedClasses = this.boostedClasses = new Map<IDslClass, BoostedClass[]>() /*
            new IClassBoost(new Warrior(), 30, null, null),
            new IClassBoost(new Barbarian(), 30, null, null),
            new IClassBoost(new Armsman(), 10, null, null),
            new IClassBoost(new Samurai(), -10, null, null),
            new IClassBoost(new Thief(), -30, null, null),
            new IClassBoost(new Assassin(), -30, null, null),
            new IClassBoost(new Bandit(), -20, null, null),
            new IClassBoost(new Ninja(), -20, null, null),
            new IClassBoost(new Cleric(), -20, null, null),
            new IClassBoost(new Crusader(), -20, null, null),
            new IClassBoost(new Druid(), -20, null, null),
            new IClassBoost(new Priest(), -20, null, null),
        */;
    this.imageUrl = `https://shatteredarchive.com/img/races/GiantOgre.png`;
    this.description = `Giant Ogres stand 12' tall - even kneeling they rise above the heads of
other ogres.  They are the largest race in the world (except for old
Dragons, of course).  They have tusk-like teeth that protrude from their
broad mouths and are generally not as intelligent as other ogres.  They make
awesome warriors and are ill suited for any other class.  They get fast
healing for free due to their size and stamina.  They vulnerable to mental
attacks due to their slow minds.  They are resistant to blunt weapons
because of their enormous size.`;
  }

  // Method to get the single instance of the class
  public static GetInstance(): GiantOgre {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Races[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return GiantOgre.GetInstance() as T;
  }
}

export default GiantOgre;
