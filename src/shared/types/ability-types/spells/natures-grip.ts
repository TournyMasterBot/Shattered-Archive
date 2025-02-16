import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class NaturesGrip implements IAbility {
  private static instance: NaturesGrip;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = "Natures Grip";
    this.helpFile = `
NATURES GRIP

Syntax: cast 'natures grip'

The Eldritch's staff is their tool for channelling the power Zandreya has
bestowed upon them and without it; the Eldritch is rendered almost helpless.
This spell ensures that the staff is held securely in hand making it more
difficult for disarming while facing a determined enemy.

Groups containing this spell: ELDRITCH
`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (NaturesGrip.instance === undefined) {
      NaturesGrip.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): NaturesGrip {
    if (!NaturesGrip.instance) {
      NaturesGrip.instance = new NaturesGrip();
    }
    return NaturesGrip.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return NaturesGrip.GetInstance() as T;
  }
}

export default NaturesGrip;
