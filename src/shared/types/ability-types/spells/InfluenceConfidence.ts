import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class InfluenceConfidence implements IAbility {
  private static instance: InfluenceConfidence;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `INFLUENCE CONFIDENCE

As with allowing their friends to focus their aggression, the mentalist is
able to instill confidence within their friends and their self.  This
increased confidence allows the person being cast upon to become more
confident in their weapon, allowing them to swing with more precise
striking.  

This spell gains power as the mentalist gains level.  

Syntax :  cast 'influence confidence' target`;
    this.manualDescription = "";
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (InfluenceConfidence.instance === undefined) {
      InfluenceConfidence.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): InfluenceConfidence {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return InfluenceConfidence.GetInstance() as T;
  }
}

export default InfluenceConfidence;
