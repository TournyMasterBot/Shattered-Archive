import IAbility from "@shared/types/ability-types/ability";
import Bash from "@shared/types/ability-types/skills/Bash";
import FastHealing from "@shared/types/ability-types/skills/FastHealing";
import { IStatAttribute, StatAttribute, StatAttributeType } from "@shared/types/character-types/stat-attribute";
import ColdDamageTypes from "@shared/types/damage-types/damage-type-group-models/groups-cold";
import MentalDamageTypes from "@shared/types/damage-types/damage-type-group-models/groups-mental";
import BoostedClass from "@shared/types/character-types/boostedClass";
import IDamageType from "@shared/types/damage-types/damage-type-interface";
import IDslClass from "@shared/types/character-types/dslClass";
import { IRace } from "@shared/types/character-types/race-interface";
import ServerCache from "@shared/cache/server-cache";

class Ogre implements IRace {
  private static instance: Ogre;

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
    this.id = "16";
    this.name = this.constructor.name;
    this.displayName = "Ogre";
    this.isLimitedRace = false;
    this.isMortalRace = true;
    this.isLargeRace = true;
    this.cpModifier = 2.0;
    this.stats = [
      new StatAttribute({
        type: StatAttributeType.Strength,
        modifier: 85,
      }),
      new StatAttribute({
        type: StatAttributeType.Intelligence,
        modifier: 34,
      }),
      new StatAttribute({
        type: StatAttributeType.Wisdom,
        modifier: 45,
      }),
      new StatAttribute({
        type: StatAttributeType.Dexterity,
        modifier: 40,
      }),
      new StatAttribute({
        type: StatAttributeType.Constitution,
        modifier: 85,
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
    this.resistances = [...ColdDamageTypes.getAll()];
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
            new Mage(),
            new Illusionist(),
            new Witch(),
            new Warlock(),
            new Enchantor(),
            new Mentalist(),
            new WuJen(),
            new Cleric(),
            new Crusader(),
            new Druid(),
            new Shaman(),
            new Priest(),
            new Shukenja(),
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
            new IClassBoost(new Warrior(), 30, null, null),
            new IClassBoost(new Barbarian(), 10, null, null),
            new IClassBoost(new Ranger(), -10, null, null),
            new IClassBoost(new Armsman(), 30, null, null),
            new IClassBoost(new Samurai(), -10, null, null),
            new IClassBoost(new Thief(), -20, null, null),
            new IClassBoost(new Assassin(), -20, null, null),
            new IClassBoost(new Bandit(), -10, null, null),
            new IClassBoost(new Ninja(), -20, null, null),
            new IClassBoost(new Mage(), -10, null, null),
            new IClassBoost(new Illusionist(), -20, null, null),
            new IClassBoost(new Enchantor(), -20, null, null),
            new IClassBoost(new Mentalist(), -20, null, null),
            new IClassBoost(new WuJen(), -20, null, null),
            new IClassBoost(new Cleric(), -10, null, null),
            new IClassBoost(new Druid(), -20, null, null),
            new IClassBoost(new Priest(), -10, null, null),
            new IClassBoost(new Shukenja(), 10, null, null),
            new IClassBoost(new Monk(), -20, null, null),
            new IClassBoost(new Invoker(), -20, null, null),
        */;
    this.imageUrl = `https://shatteredarchive.com/img/races/Ogre.png`;
    this.description = `Ogres are of the largest of the races, ranging from 9-10 feet in height. 
They are stronger than any other race, and almost as durable as the dwarves.
They aren't too bright, however, and their huge size makes them more clumsy
than the other races.  Ogres make the best warriors of any race, but are
ill-suited for any other profession.  

Ogres resist the cold with nary a mark, due to their huge mass.  However,
their slow minds make them extremely vulnerable to mental attacks.  Ogres,
due to their size and stamina, receive the fast healing and bash skills for
free.  (Only ogre warriors receive bash).  

For more information on subraces of ogres see: 'HALF OGRE' 'GIANT OGRE'`;
  }

  // Method to get the single instance of the class
  public static GetInstance(): Ogre {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Races[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Ogre.GetInstance() as T;
  }
}

export default Ogre;
