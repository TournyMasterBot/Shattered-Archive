import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class SummonStonelord implements IAbility {
  private static instance: SummonStonelord;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `SUMMON STONELORD

Syntax:  cast 'summon stonelord'
 
Through the teachings of Zandreya, an Eldritch may summon forth a large
Stonelord to fight by their side, using its great power to crush any foe 
before them.  

Groups containing this spell: ELDRITCH`;
    this.manualDescription = ``;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (SummonStonelord.instance === undefined) {
      SummonStonelord.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): SummonStonelord {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return SummonStonelord.GetInstance() as T;
  }
}

export default SummonStonelord;
