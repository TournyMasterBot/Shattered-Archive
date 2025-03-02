import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class ConcealedDagger implements IAbility {
  private static instance: ConcealedDagger;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
CONCEALED DAGGER

Passive Skill

Pirates always carry a little extra security. If they are disarmed, they have a
chance to land one hit with a 'hidden' weapon. You do not need to carry an extra
dagger for this skill to work.
`;
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Passive;
    this.manualDescription = "";

    if (ConcealedDagger.instance === undefined) {
      ConcealedDagger.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): ConcealedDagger {
    if (!ConcealedDagger.instance) {
      ConcealedDagger.instance = new ConcealedDagger();
    }
    return ConcealedDagger.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return ConcealedDagger.GetInstance() as T;
  }
}

export default ConcealedDagger;
