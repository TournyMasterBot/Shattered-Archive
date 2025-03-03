import IAbility from "@shared/types/ability-types/ability";
import FastHealing from "@shared/types/ability-types/skills/FastHealing";
import Hide from "@shared/types/ability-types/skills/Hide";
import Sneak from "@shared/types/ability-types/skills/Sneak";
import { IStatAttribute, StatAttribute, StatAttributeType } from "@shared/types/character-types/stat-attribute";
import ColdDamageTypes from "@shared/types/damage-types/damage-type-group-models/groups-cold";
import FireDamageTypes from "@shared/types/damage-types/damage-type-group-models/groups-fire";
import LightningDamageTypes from "@shared/types/damage-types/damage-type-group-models/groups-lightning";
import BoostedClass from "@shared/types/character-types/boostedClass";
import IDamageType from "@shared/types/damage-types/damage-type-interface";
import IDslClass from "@shared/types/character-types/dslClass";
import { IRace } from "@shared/types/character-types/race-interface";
import ServerCache from "@shared/cache/server-cache";

class Yinn implements IRace {
  private static instance: Yinn;

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
    this.id = "20";
    this.name = this.constructor.name;
    this.displayName = "Yinn";
    this.isLimitedRace = false;
    this.isMortalRace = true;
    this.isLargeRace = true;
    this.cpModifier = 20;
    this.stats = [
      new StatAttribute({
        type: StatAttributeType.Strength,
        modifier: 70,
      }),
      new StatAttribute({
        type: StatAttributeType.Intelligence,
        modifier: 52,
      }),
      new StatAttribute({
        type: StatAttributeType.Wisdom,
        modifier: 53,
      }),
      new StatAttribute({
        type: StatAttributeType.Dexterity,
        modifier: 62,
      }),
      new StatAttribute({
        type: StatAttributeType.Constitution,
        modifier: 65,
      }),
    ];
    this.primaryAttributeModifier = new StatAttribute({
      type: StatAttributeType.Variable,
      modifier: 12,
    });
    this.secondaryAttributeModifier = new StatAttribute({
      type: StatAttributeType.Variable,
      modifier: 6,
    });
    this.immunities = [];
    this.resistances = [...ColdDamageTypes.getAll(), ...LightningDamageTypes.getAll()];
    this.vulnerabilities = [...FireDamageTypes.getAll()];
    this.racialAbilities = [Sneak.GetInstance().Get(), Hide.GetInstance().Get(), FastHealing.GetInstance().Get()];
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
            new Nightshade(),
            new Ninja(),
            new Mage(),
            new Illusionist(),
            new Enchantor(),
            new Mentalist(),
            new WuJen(),
            new Cleric(),
            new Crusader(),
            new Druid(),
            new Priest(),
            new Shukenja(),
            new Bard(),
            new Jongleur(),
            new Skald(),
            new Brewmaster(),
            new Monk(),
            new Dragonslayer(),
            new Invoker(),
            new Transmuter(),
            new Necromancer(),
            new Battlemage()
            */
    ];
    this.restrictedClasses = [
      /*var missingClasses = DslClassHelper.GetAvailableClasses().Where(x => !this.AvailableClasses.Any(y => y.Name == x.Name)).ToArray();
                return missingClasses.ToArray();*/
    ];
    this.boostedClasses = this.boostedClasses = new Map<IDslClass, BoostedClass[]>() /*
            new IClassBoost(new Warrior(), 10, null, null),
            new IClassBoost(new Samurai(), 20, null, null),
            new IClassBoost(new Thief(), -10, null, null),
            new IClassBoost(new Assassin(), 10, null, null),
            new IClassBoost(new Bandit(), 10, null, null),
            new IClassBoost(new Nightshade(), -10, null, null),
            new IClassBoost(new Ninja(), 10, null, null),
            new IClassBoost(new WuJen(), 10, null, null),
            new IClassBoost(new Crusader(), 10, null, null),
            new IClassBoost(new Priest(), 10, null, null),
            new IClassBoost(new Shukenja(), 10, null, null),
            new IClassBoost(new Bard(), -10, null, null),
            new IClassBoost(new Jongleur(), -10, null, null),
            new IClassBoost(new Skald(), -20, null, null),
            new IClassBoost(new Monk(), 20, null, null),
            new IClassBoost(new Dragonslayer(), 10, null, null),
        */;
    this.imageUrl = `https://shatteredarchive.com/img/races/Yinn.png`;
    this.description = `Proud and strong, the Yinn race is very misunderstood.  Yinn are reclusive
and silent, and prefer not to be seen.  They are bipedal canine creatures,
standing over 7-8 feet tall.  In many respects, their form is of humanoid
nature.  They have no tails, their skin is furred, in canine fashion.  Their
teeth are longer, and their eyes often see clearer to the environment around
them, and they tend toward an enhanced sense of smell.  Yinn tend to be a
more arrogant race, holding themselves above all other races of the realm. 

Yinn are reviled by all other races, yet respected just the same.  They are
rarely seen, and when one is spotted, the spotter usually does not survive
to tell anybody else about it.  Yinn come from a cold wasteland area with
violent storms and are resistant to cold and lightning.  They don't like
fire though.`;
  }

  // Method to get the single instance of the class
  public static GetInstance(): Yinn {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Races[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Yinn.GetInstance() as T;
  }
}

export default Yinn;
