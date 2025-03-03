import IAbility from "@shared/types/ability-types/ability";
import { IStatAttribute, StatAttribute, StatAttributeType } from "@shared/types/character-types/stat-attribute";
import BoostedClass from "@shared/types/character-types/boostedClass";
import IDamageType from "@shared/types/damage-types/damage-type-interface";
import IDslClass from "@shared/types/character-types/dslClass";
import { IRace } from "@shared/types/character-types/race-interface";
import ServerCache from "@shared/cache/server-cache";

class Troll implements IRace {
  private static instance: Troll;

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
    this.id = "35";
    this.name = this.constructor.name;
    this.displayName = "Troll";
    this.isLimitedRace = true;
    this.isMortalRace = true;
    this.isLargeRace = true;
    this.cpModifier = undefined;
    this.stats = [
      new StatAttribute({
        type: StatAttributeType.Strength,
        modifier: 90,
      }),
      new StatAttribute({
        type: StatAttributeType.Intelligence,
        modifier: 45,
      }),
      new StatAttribute({
        type: StatAttributeType.Wisdom,
        modifier: 45,
      }),
      new StatAttribute({
        type: StatAttributeType.Dexterity,
        modifier: 60,
      }),
      new StatAttribute({
        type: StatAttributeType.Constitution,
        modifier: 80,
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
    this.racialAbilities = [];
    this.availableClasses = [
      /*
            new Warrior(),
            new Barbarian(),
            new Ranger(),
            new Swashbuckler(),
            new Armsman(),
            new Samurai(),
            new Cleric(),
            new Crusader(),
            new Druid(),
            new Shaman(),
            new Priest(),
            new Shukenja(),
            new Monk(),
            new Dragonslayer()
            */
    ];
    this.restrictedClasses = [
      /*var missingClasses = DslClassHelper.GetAvailableClasses().Where(x => !this.AvailableClasses.Any(y => y.Name == x.Name)).ToArray();
                return missingClasses.ToArray();*/
    ];
    this.boostedClasses = this.boostedClasses = new Map<IDslClass, BoostedClass[]>() /*
            new IClassBoost(new Warrior(), 10, null, null),
            new IClassBoost(new Barbarian(), 10, null, null),
            new IClassBoost(new Samurai(), -10, null, null),
            new IClassBoost(new Cleric(), 10, null, null),
        */;
    this.imageUrl = `https://shatteredarchive.com/img/races/Troll.png`;
    this.description = `(No helpfile)`;
  }

  // Method to get the single instance of the class
  public static GetInstance(): Troll {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Races[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Troll.GetInstance() as T;
  }
}

export default Troll;
