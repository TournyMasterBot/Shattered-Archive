import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Balance implements IAbility {
  private static instance: Balance;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = "Balance";
    this.helpFile = `
help balance
balance
BALANCE

Passive Skill

Due to the time spent sailing the high seas, pirates possess uncanny sense of
balance, so they recover easily from any attempt to stun them.
        `;

    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Passive;

    if (Balance.instance === undefined) {
      Balance.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Balance {
    if (!Balance.instance) {
      Balance.instance = new Balance();
    }
    return Balance.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Balance.GetInstance() as T;
  }
}

export default Balance;
