import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Tornado implements IAbility {
  private static instance: Tornado;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `help tornado
TORNADO
Syntax:  cast 'tornado' <target>
This spell summons a deadly tornado.  These powerful weather phenomena
have been known to carry away objects lying around the room, as well as
people!`;
    this.manualDescription = `This spell doesn't actually do any damage.`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (Tornado.instance === undefined) {
      Tornado.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Tornado {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Tornado.GetInstance() as T;
  }
}

export default Tornado;
