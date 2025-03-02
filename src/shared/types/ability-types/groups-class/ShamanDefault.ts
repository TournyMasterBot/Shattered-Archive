import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Dodge from "@shared/types/ability-types/skills/Dodge";
import Skewer from "@shared/types/ability-types/skills/Skewer";
import Butcher from "@shared/types/ability-types/skills/Butcher";
import FindWater from "@shared/types/ability-types/skills/FindWater";
import EnhancedSpear from "@shared/types/ability-types/skills/EnhancedSpear";
import Benedictions from "@shared/types/ability-types/groups-spells/Benedictions";
import Detection from "../groups-spells/Detection";
import Maladictions from "../groups-spells/Maladictions";
import Protective from "../groups-spells/Protective";
import Voodoo from "../groups-spells/Voodoo";
import Weather from "../groups-spells/Weather";
import ServerCache from "@shared/cache/server-cache";

export class ShamanDefault implements IAbilityGroup {
  static instance: ShamanDefault;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.ShamanDefault;
    this.abilityGroupType = AbilityGroupType.Default;
    this.abilities = [
      ...Voodoo.GetInstance().abilities,
      ...Detection.GetInstance().abilities,
      ...Weather.GetInstance().abilities,
      ...Protective.GetInstance().abilities,
      ...Maladictions.GetInstance().abilities,
      ...Benedictions.GetInstance().abilities,
      Dodge.GetInstance(),
      Skewer.GetInstance(),
      Butcher.GetInstance(),
      FindWater.GetInstance(),
      EnhancedSpear.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): ShamanDefault {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return ShamanDefault.GetInstance() as T;
  }
}

export default ShamanDefault;
