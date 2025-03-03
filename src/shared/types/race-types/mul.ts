import IAbility from "@shared/types/ability-types/ability";
import Berserk from "@shared/types/ability-types/skills/Berserk";
import FastHealing from "@shared/types/ability-types/skills/FastHealing";
import Toughness from "@shared/types/ability-types/skills/Toughness";
import { IStatAttribute, StatAttribute, StatAttributeType } from "@shared/types/character-types/stat-attribute";
import BoostedClass from "@shared/types/character-types/boostedClass";
import IDamageType from "@shared/types/damage-types/damage-type-interface";
import IDslClass from "@shared/types/character-types/dslClass";
import { IRace } from "@shared/types/character-types/race-interface";
import ServerCache from "@shared/cache/server-cache";

class Mul implements IRace {
  private static instance: Mul;

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
    this.id = "13";
    this.name = this.constructor.name;
    this.displayName = "Mul";
    this.isLimitedRace = false;
    this.isMortalRace = true;
    this.isLargeRace = false;
    this.cpModifier = 17;
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
        modifier: 50,
      }),
      new StatAttribute({
        type: StatAttributeType.Dexterity,
        modifier: 66,
      }),
      new StatAttribute({
        type: StatAttributeType.Constitution,
        modifier: 68,
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
    this.racialAbilities = [FastHealing.GetInstance().Get(), Berserk.GetInstance().Get(), Toughness.GetInstance().Get()];
    this.availableClasses = [
      /*
            new Warrior(),
            new Barbarian(),
            new Ranger(),
            new Swashbuckler(),
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
            new Bard(),
            new Jongleur(),
            new Charlatan(),
            new Skald(),
            new Brewmaster(),
            new Monk(),
            new Dragonslayer(),
            new Invoker(),
            new Transmuter(),
            new Necromancer(),
            new Battlemage(),
            new Battlerager(),
            new Runesmith()
            */
    ];
    this.restrictedClasses = [
      /*var missingClasses = DslClassHelper.GetAvailableClasses().Where(x => !this.AvailableClasses.Any(y => y.Name == x.Name)).ToArray();
                return missingClasses.ToArray();*/
    ];
    this.boostedClasses = this.boostedClasses = new Map<IDslClass, BoostedClass[]>() /*
            new IClassBoost(new Swashbuckler(), -20, null, null),
            new IClassBoost(new Samurai(), 10, null, null),
            new IClassBoost(new Bandit(), 10, null, null),
            new IClassBoost(new Nightshade(), -20, null, null),
            new IClassBoost(new Ninja(), -10, null, null),
            new IClassBoost(new Mage(), -30, null, null),
            new IClassBoost(new Mentalist(), -30, null, null),
            new IClassBoost(new WuJen(), -10, null, null),
            new IClassBoost(new Druid(), -30, null, null),
            new IClassBoost(new Shukenja(), 10, null, null),
            new IClassBoost(new Bard(), -20, null, null),
            new IClassBoost(new Brewmaster(), 20, null, null),
            new IClassBoost(new Battlerager(), -20, null, null),
        */;
    this.imageUrl = `https://shatteredarchive.com/img/races/Mul.png`;
    this.description = `Mul Dwarves are the cross-breeds between dwarves and humans.  They are
broad built and range from five to five and a half feet in height.  They are
unable to grow hair on any part of their bodies.  As a result of their
unusual breeding they are born sterile, unable to produce.  The mul race was
very suited to slave labor and gladiator fighting which encouraged many,
especially the goblins, to breed them regularly for this purpose.  It is
rumored that the founder of the Algoron Gladiator League, Baron Randorf
Del'nichi, bred the first Mul for the purpose of shaping a better fighter
for the Gladiator League.  

They are well suited to warrior classes like their parental races and their
past.  Their thinking is not quite on the same level as the dwarf
hardliners, so with their unique physique they make excellent assassins and
bandits as well.  They can train as mages and clerics though they are not
suited to using magic at all.  

Muls are best suited within the Clan of Wargar and the Kingdom of Thaxanos.`;
  }

  // Method to get the single instance of the class
  public static GetInstance(): Mul {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Races[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Mul.GetInstance() as T;
  }
}

export default Mul;
