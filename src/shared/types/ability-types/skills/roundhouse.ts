import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Roundhouse implements IAbility {
  private static instance: Roundhouse;

  name: string;
  helpFile: string;
  manualDescription: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = "Roundhouse";
    this.helpFile = `
help roundhouse
ROUNDHOUSE
This skill is learned by those who are well acquainted to bar room
brawls. It is a wild, looping punch designed to stun and daze the opponent.
Due to the wild nature of the swing, it is somewhat unreliable.
`;
    this.manualDescription =
      "In addition to stunning your opponent, this can also force them into a resting position.";
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Active;

    if (Roundhouse.instance === undefined) {
      Roundhouse.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Roundhouse {
    if (!Roundhouse.instance) {
      Roundhouse.instance = new Roundhouse();
    }
    return Roundhouse.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Roundhouse.GetInstance() as T;
  }
}

export default Roundhouse;
