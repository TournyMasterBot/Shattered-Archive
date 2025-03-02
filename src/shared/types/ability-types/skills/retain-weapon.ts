import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class RetainWeapon implements IAbility {
  private static instance: RetainWeapon;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
retain weapon
With unequaled skill in their chosen weapons, swashbucklers become almost
one with them after enough time and training. Just because the weapon
leaves their hand does not necessarily mean it is lost for the fight. Lithe
in their movement, they are able to reposition themselves when disarmed so
that they catch their weapon and continue the fight without it ever hitting
the ground.  
`;
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Active;

    if (RetainWeapon.instance === undefined) {
      RetainWeapon.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): RetainWeapon {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return RetainWeapon.GetInstance() as T;
  }
}

export default RetainWeapon;
