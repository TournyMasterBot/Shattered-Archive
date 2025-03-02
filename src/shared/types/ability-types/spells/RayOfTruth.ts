import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class RayOfTruth implements IAbility {
  private static instance: RayOfTruth;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
help 'Ray of Truth'
'RAY OF TRUTH'
RAY OF TRUTH

Syntax: cast 'ray of truth' <target>

Ray of truth opens a portal to the planes of positive energy, bringing forth
a beam of light of sufficient purity to harm or annihilate the servants of
evil.  It cannot harm the pure of heart, and will turn and strike casters
who are tainted by evil.  

See also - ATTACK
        `;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (RayOfTruth.instance === undefined) {
      RayOfTruth.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): RayOfTruth {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return RayOfTruth.GetInstance() as T;
  }
}

export default RayOfTruth;
