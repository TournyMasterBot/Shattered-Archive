import IDslArmorType from "@shared/types/item-types/armor-type-interface";

class DslArmorType implements IDslArmorType {
    id: string;
    name: string;
    description?: string;

    constructor(config: Partial<DslArmorType>) {
        this.id = config.id!;
        this.name = config.name!;
        this.description = config.description;
    }

    static None = new DslArmorType({
        id: "0",
        name: "none",
        description: "none"
    });
    
    static Cloth = new DslArmorType({
        id: "1",
        name: "cloth",
        description: "cloth"
    });
    
    static Leather = new DslArmorType({
        id: "2",
        name: "leather",
        description: "leather"
    });
    
    static Studded = new DslArmorType({
        id: "4",
        name: "studded",
        description: "studded"
    });
    
    static Chain = new DslArmorType({
        id: "8",
        name: "chain",
        description: "chain"
    });
    
    static Plate = new DslArmorType({
        id: "16",
        name: "plate",
        description: "plate"
    });

    /**
        @usage
        ```
            const armorTypes = DslArmorType.values();
            console.log(armorTypes.map(at => `${at.name}: ${at.description}`));
        ```
    */
    static values(): DslArmorType[] {
        return [
            DslArmorType.None,
            DslArmorType.Cloth,
            DslArmorType.Leather,
            DslArmorType.Studded,
            DslArmorType.Chain,
            DslArmorType.Plate,
        ];
    }
}

export default DslArmorType;

