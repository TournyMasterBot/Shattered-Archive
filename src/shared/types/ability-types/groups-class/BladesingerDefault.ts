import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Combat from "../groups-spells/Combat";
import Detection from "../groups-spells/Detection";
import Enhancement from "@shared/types/ability-types/groups-spells/Enhancement";
import Transportation from "../groups-spells/Transportation";
import Circle from "@shared/types/ability-types/skills/circle";
import CircleStab from "@shared/types/ability-types/skills/circle-stab";
import Dodge from "@shared/types/ability-types/skills/dodge";
import EnhancedDamage from "@shared/types/ability-types/skills/enhanced-damage";
import Offhand from "@shared/types/ability-types/skills/offhand";
import Parry from "@shared/types/ability-types/skills/parry";
import Reposition from "@shared/types/ability-types/skills/reposition";
import ThirdAttack from "@shared/types/ability-types/skills/third-attack";
import ServerCache from "@shared/cache/server-cache";

export class BladesingerDefault implements IAbilityGroup {
  static instance: BladesingerDefault;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.BladesingerDefault;
    this.abilityGroupType = AbilityGroupType.Default;
    this.abilities = [
      ...Detection.GetInstance().abilities,
      ...Enhancement.GetInstance().abilities,
      ...Combat.GetInstance().abilities,
      ...Transportation.GetInstance().abilities,
      EnhancedDamage.GetInstance(),
      Parry.GetInstance(),
      Reposition.GetInstance(),
      Dodge.GetInstance(),
      CircleStab.GetInstance(),
      ThirdAttack.GetInstance(),
      Circle.GetInstance(),
      Offhand.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): BladesingerDefault {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return BladesingerDefault.GetInstance() as T;
  }
}

export default BladesingerDefault;
