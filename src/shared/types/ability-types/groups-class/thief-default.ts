import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Mace from "@shared/types/ability-types/skills/mace";
import Disarm from "@shared/types/ability-types/skills/disarm";
import Trip from "@shared/types/ability-types/skills/trip";
import PickLock from "@shared/types/ability-types/skills/pick-lock";
import Sword from "@shared/types/ability-types/skills/sword";
import Dodge from "@shared/types/ability-types/skills/dodge";
import Hide from "@shared/types/ability-types/skills/hide";
import Sneak from "@shared/types/ability-types/skills/sneak";
import Backstab from "@shared/types/ability-types/skills/backstab";
import SecondAttack from "@shared/types/ability-types/skills/second-attack";
import Peek from "@shared/types/ability-types/skills/peek";

export class ThiefDefault implements IAbilityGroup {
  static instance: ThiefDefault;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name.toLowerCase();
    this.abilityGroup = AbilityGroup.ThiefDefault;
    this.abilityGroupType = AbilityGroupType.Default;
    this.abilities = [
      Mace.GetInstance().Get(),
      Disarm.GetInstance().Get(),
      Trip.GetInstance().Get(),
      PickLock.GetInstance().Get(),
      Sword.GetInstance().Get(),
      Dodge.GetInstance().Get(),
      Hide.GetInstance().Get(),
      Sneak.GetInstance().Get(),
      Backstab.GetInstance().Get(),
      SecondAttack.GetInstance().Get(),
      Peek.GetInstance().Get(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): ThiefDefault {
    if (!ThiefDefault.instance) {
      ThiefDefault.instance = new ThiefDefault();
    }
    return ThiefDefault.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return ThiefDefault.GetInstance() as T;
  }
}

export default ThiefDefault;
