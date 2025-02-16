import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Combat from "../groups-spells/combat";
import Detection from "../groups-spells/detection";
import Enhancement from "@shared/types/ability-types/groups-spells/enhancement";
import Transportation from "../groups-spells/transportation";
import Circle from "@shared/types/ability-types/skills/circle";
import CircleStab from "@shared/types/ability-types/skills/circle-stab";
import Dodge from "@shared/types/ability-types/skills/dodge";
import EnhancedDamage from "@shared/types/ability-types/skills/enhanced-damage";
import Offhand from "@shared/types/ability-types/skills/offhand";
import Parry from "@shared/types/ability-types/skills/parry";
import Reposition from "@shared/types/ability-types/skills/reposition";
import ThirdAttack from "@shared/types/ability-types/skills/third-attack";

export class BladesingerDefault implements IAbilityGroup {
  static instance: BladesingerDefault;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];

  constructor() {
    this.abilityGroup = AbilityGroup.BladesingerDefault;
    this.abilityGroupType = AbilityGroupType.Default;
    this.abilities = [
      ...Detection.GetInstance().Get<Detection>().abilities,
      ...Enhancement.GetInstance().Get<Enhancement>().abilities,
      ...Combat.GetInstance().Get<Combat>().abilities,
      ...Transportation.GetInstance().Get<Transportation>().abilities,
      EnhancedDamage.GetInstance().Get(),
      Parry.GetInstance().Get(),
      Reposition.GetInstance().Get(),
      Dodge.GetInstance().Get(),
      CircleStab.GetInstance().Get(),
      ThirdAttack.GetInstance().Get(),
      Circle.GetInstance().Get(),
      Offhand.GetInstance().Get(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): BladesingerDefault {
    if (!BladesingerDefault.instance) {
      BladesingerDefault.instance = new BladesingerDefault();
    }
    return BladesingerDefault.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return BladesingerDefault.GetInstance() as T;
  }
}

export default BladesingerDefault;
