import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Sword from "@shared/types/ability-types/skills/sword";
import Dagger from "@shared/types/ability-types/skills/dagger";
import Dodge from "@shared/types/ability-types/skills/dodge";

export class PirateBasics implements IAbilityGroup {
  static instance: PirateBasics;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];

  constructor() {
    this.abilityGroup = AbilityGroup.PirateBasics;
    this.abilityGroupType = AbilityGroupType.Basics;
    this.abilities = [
      Sword.GetInstance().Get(),
      Dagger.GetInstance().Get(),
      Dodge.GetInstance().Get(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): PirateBasics {
    if (!PirateBasics.instance) {
      PirateBasics.instance = new PirateBasics();
    }
    return PirateBasics.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return PirateBasics.GetInstance() as T;
  }
}

export default PirateBasics;
