import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class WindBreath implements IAbility {
  private static instance: WindBreath;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `WIND BREATH

Syntax: cast 'wind breath' <target>

When successfully cast by the battlemage, this spell sets a magical wind
upon its target that is strong enough to potentially knock them backwards
and stun them.  

Groups containing this spell: Battlemagic
 
SEE ALSO:  BATTLEMAGE, BATTLEMAGIC
 
Updated 03.19.2021`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (WindBreath.instance === undefined) {
      WindBreath.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): WindBreath {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return WindBreath.GetInstance() as T;
  }
}

export default WindBreath;
