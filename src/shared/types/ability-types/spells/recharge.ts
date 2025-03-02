import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Recharge implements IAbility {
  private static instance: Recharge;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
help recharge
'RECHARGE'
RECHARGE
Syntax: cast 'recharge' <item>
The recharge spell is used to restore energy to depleted wands and staves.
Fully exhausted items cannot be recharged, and the difficulty of the spell
is proportional to the number of charges used. Magic items can only be
recharged one time successfully.
        `;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (Recharge.instance === undefined) {
      Recharge.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Recharge {
    if (!Recharge.instance) {
      Recharge.instance = new Recharge();
    }
    return Recharge.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Recharge.GetInstance() as T;
  }
}

export default Recharge;
